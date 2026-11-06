'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const SUPERVISOR = path.join(__dirname, 'devflow-execution-supervisor.py')
const DEFAULT_TIMEOUT = 120000
const MAX_TIMEOUT = 120000
const DEFAULT_BUFFER = 1 << 20
const MAX_BUFFER = 64 << 20
const MAX_REPORTED_EXITS = 4096 // Must match the trusted supervisor protocol.

// Only the trusted host adapter chooses these. Command requests cannot replace
// the interpreter/helper or install a fallback. Python -I -S ignores local
// import paths, user site packages and PYTHON* settings.
const PYTHONS = ['/usr/bin/python3', '/usr/local/bin/python3', '/bin/python3']
const text = bytes => bytes.toString('utf8')
const validString = value => typeof value === 'string' && !value.includes('\0')

function blank(command, reason, adapter = 'unsupported') {
  return { code: 'NOT_VERIFIED', stdout: '', stderr: '', stdoutBase64: '', stderrBase64: '',
    job: { version: 1, adapter, state: 'not_started', reason, launched: false, command,
      rootPid: null, rootExit: null, observedExits: [], observedExitCount: 0,
      hasObservedFailure: false, outputComplete: false } }
}

function readOutput(file, limit) {
  const fd = fs.openSync(file, 'r')
  try {
    const size = fs.fstatSync(fd).size
    const bytes = Buffer.alloc(Math.min(size, limit))
    const count = fs.readSync(fd, bytes, 0, bytes.length, 0)
    return { bytes: bytes.subarray(0, count), totalBytes: size, truncated: size > count }
  } finally { fs.closeSync(fd) }
}

const recordObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const validPid = value => Number.isSafeInteger(value) && value > 0
const failedExit = exit => exit.exitCode !== 0 || exit.signal !== null
const sameExit = (left, right) => left.pid === right.pid && left.root === right.root &&
  left.exitCode === right.exitCode && left.signal === right.signal

function validExit(exit, rootPid) {
  return recordObject(exit) && validPid(exit.pid) && typeof exit.root === 'boolean' &&
    exit.root === (exit.pid === rootPid) &&
    ((Number.isSafeInteger(exit.exitCode) && exit.exitCode >= 0 && exit.exitCode <= 255 && exit.signal === null) ||
      (exit.exitCode === null && typeof exit.signal === 'string' && /^SIG(?:[A-Z][A-Z0-9]*|[1-9][0-9]*)$/.test(exit.signal)))
}

// Validate the same lifecycle evidence both at the supervisor boundary and at
// the exported result predicates. This is a schema/consistency check, not
// authentication of arbitrary caller-supplied metadata.
function notStartedShape(report) {
  return recordObject(report) && report.version === 1 && report.state === 'not_started' && report.launched === false &&
    report.rootPid === null && report.rootExit === null && Array.isArray(report.observedExits) &&
    report.observedExits.length === 0 && report.observedExitCount === 0 &&
    report.hasObservedFailure === false && report.outputComplete === false
}

function validReport(report) {
  if (!recordObject(report) || report.version !== 1 || report.adapter !== 'linux-subreaper-v1' ||
      !['settled', 'not_started', 'unknown'].includes(report.state) ||
      typeof report.reason !== 'string' || !report.reason || typeof report.launched !== 'boolean' ||
      typeof report.hasObservedFailure !== 'boolean' || typeof report.outputComplete !== 'boolean' ||
      !Array.isArray(report.observedExits) || !Number.isSafeInteger(report.observedExitCount) || report.observedExitCount < 0 ||
      report.observedExits.length !== Math.min(report.observedExitCount, MAX_REPORTED_EXITS)) return false

  if (!report.launched) return notStartedShape(report)
  if (!validPid(report.rootPid) || report.state === 'not_started') return false
  if (report.rootExit !== null && (!validExit(report.rootExit, report.rootPid) || report.rootExit.root !== true)) return false

  let rootObserved = false
  let failure = false
  for (const exit of report.observedExits) {
    if (!validExit(exit, report.rootPid)) return false
    if (exit.root) {
      if (rootObserved || report.rootExit === null || !sameExit(exit, report.rootExit)) return false
      rootObserved = true
    }
    failure ||= failedExit(exit)
  }
  if (report.rootExit !== null) {
    failure ||= failedExit(report.rootExit)
    // The supervisor retains the first 4096 exits. A later root exit is still
    // reported separately; complete summaries must contain its matching record.
    if (!rootObserved && report.observedExitCount <= MAX_REPORTED_EXITS) return false
  }
  if (failure && !report.hasObservedFailure) return false
  if (report.observedExitCount === report.observedExits.length && failure !== report.hasObservedFailure) return false
  if (report.state === 'settled') return report.rootExit !== null &&
    ((report.reason === 'completed' && report.outputComplete) || (report.reason === 'output_limit' && !report.outputComplete))
  return !report.outputComplete && report.reason !== 'completed' && report.reason !== 'output_limit'
}

/**
 * Synchronously run one local command job, never a shell command string.
 *
 * realEnv.run calls this only for opts.settleJob === true. Verification may
 * accept PASS only for a settled job, complete output, root code 0, no observed
 * failure, and an unchanged post-run candidate/configuration. An integer code
 * alone is insufficient: the parent may exit before adopted descendants.
 *
 * Unknown/timeout leaves processes alone and keeps raw files for recovery. The
 * caller retains its verification reservation until explicit quiescent recovery.
 * No claim is made about work sent to unrelated daemons, remote services or hosts;
 * commands using those systems require separate completion evidence. This is not
 * a sandbox against a same-user process that attacks its supervisor.
 */
function createRunner({ platform = process.platform, pythonCandidates = PYTHONS } = {}) {
  return function runJob(file, args, opts = {}) {
    const cwd = path.resolve(opts.cwd || process.cwd())
    const command = { file, args: Array.isArray(args) ? [...args] : args, cwd }
    if (!validString(file) || !file || !Array.isArray(args) || !args.every(validString)) {
      return blank(command, 'invalid_command')
    }
    if (platform !== 'linux') return blank(command, 'unsupported_platform')
    const timeout = opts.timeout ?? DEFAULT_TIMEOUT
    const maxBuffer = opts.maxBuffer ?? DEFAULT_BUFFER
    if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > MAX_TIMEOUT ||
        !Number.isSafeInteger(maxBuffer) || maxBuffer <= 0 || maxBuffer > MAX_BUFFER) {
      return blank(command, 'invalid_limits', 'linux-subreaper-v1')
    }
    const python = pythonCandidates.find(candidate => {
      try { fs.accessSync(candidate, fs.constants.X_OK); return path.isAbsolute(candidate) && fs.statSync(candidate).isFile() } catch { return false }
    })
    if (!python) return blank(command, 'missing_supervisor', 'linux-subreaper-v1')
    let directory
    let invoked = false
    let result = blank(command, 'supervisor_error', 'linux-subreaper-v1')
    try {
      directory = fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-job-'))
      fs.chmodSync(directory, 0o700)
      const stdoutPath = path.join(directory, 'stdout.bin'), stderrPath = path.join(directory, 'stderr.bin')
      const stdinPath = path.join(directory, 'stdin.bin'), exitsPath = path.join(directory, 'exits.jsonl')
      for (const filename of [stdoutPath, stderrPath, exitsPath]) fs.writeFileSync(filename, '', { mode: 0o600, flag: 'wx' })
      fs.writeFileSync(stdinPath, opts.input == null ? '' : opts.input, { mode: 0o600, flag: 'wx' })
      const request = { file, args, cwd, env: opts.env || process.env, timeout, stdoutPath, stderrPath, stdinPath, exitsPath }
      // Child output goes to files and cannot hold the supervisor's protocol pipe
      // open. The outer deadline only stops a stuck trusted helper, never signals
      // an arbitrary user command/process group. Any such outcome stays unknown.
      invoked = true
      const invocation = spawnSync(python, ['-I', '-S', '-B', SUPERVISOR], {
        cwd: path.dirname(SUPERVISOR), input: JSON.stringify(request), encoding: 'utf8',
        timeout: timeout + 5000, killSignal: 'SIGKILL', maxBuffer: 1 << 20,
        windowsHide: true,
      })
      // Command stdin can contain private data. It is no longer needed by any
      // open descriptor; unlink it even for an unresolved child.
      fs.unlinkSync(stdinPath)
      let report
      try { report = JSON.parse(invocation.stdout || '') } catch {}
      if (!invocation.error && invocation.status === 0 && validReport(report)) {
        result.job = { ...report, command }
        result.code = report.rootExit?.exitCode ?? report.rootExit?.signal ?? report.errorCode ?? (report.state === 'unknown' ? 'unknown' : 'NOT_VERIFIED')
      } else {
        result.code = invocation.error?.code || invocation.signal || 'unknown'
        result.job = { ...result.job, state: 'unknown', launched: null, reason: 'supervisor_error',
          supervisorExitCode: invocation.status, supervisorSignal: invocation.signal || null }
      }
      if (invocation.stderr) result.job.supervisorStderr = invocation.stderr
      const out = readOutput(stdoutPath, maxBuffer), err = readOutput(stderrPath, maxBuffer)
      result.stdout = text(out.bytes); result.stderr = text(err.bytes)
      result.stdoutBase64 = out.bytes.toString('base64'); result.stderrBase64 = err.bytes.toString('base64')
      result.job.stdoutBytes = out.totalBytes; result.job.stderrBytes = err.totalBytes
      if (out.truncated || err.truncated) {
        result.job.outputComplete = false
        if (result.job.state === 'settled') result.job.reason = 'output_limit'
      }
      if (result.job.state === 'unknown' || (result.job.state === 'settled' && !result.job.outputComplete) || report?.observedExitCount > report?.observedExits.length) {
        result.job.artifacts = { directory, stdoutPath, stderrPath, exitsPath }
      }
    } catch (error) {
      // A post-launch read/parse failure cannot establish that the command ended.
      const errorCode = error.code || error.name
      result.code = result.job.rootExit?.exitCode ?? result.job.rootExit?.signal ?? (invoked ? 'unknown' : errorCode)
      result.job = { ...result.job, state: invoked ? 'unknown' : 'not_started', reason: 'supervisor_error', outputComplete: false,
        errorCode, errorMessage: error.message }
      if (directory && invoked) result.job.artifacts = { directory,
        stdoutPath: path.join(directory, 'stdout.bin'), stderrPath: path.join(directory, 'stderr.bin'),
        exitsPath: path.join(directory, 'exits.jsonl') }
    } finally {
      if (directory && !result.job.artifacts) fs.rmSync(directory, { recursive: true, force: true })
      if (directory) {
        try { fs.unlinkSync(path.join(directory, 'stdin.bin')) } catch {}
      }
    }
    return result
  }
}

const runJob = createRunner()

// Local lifecycle only: a settled nonzero/signal or incomplete-output result is
// still finished. It says nothing about a remote service's mutation outcome.
const isSettledResult = result => recordObject(result) && validReport(result.job) && result.job.state === 'settled' &&
  result.job.errorCode === undefined && result.code === (result.job.rootExit.exitCode ?? result.job.rootExit.signal)

function isNotStartedResult(result) {
  if (!recordObject(result) || !notStartedShape(result.job)) return false
  const job = result.job
  // These are existing host refusals, never a supported execution adapter.
  if (job.adapter === 'unsupported') return ['invalid_command', 'unsupported_platform'].includes(job.reason) &&
    job.errorCode === undefined && result.code === 'NOT_VERIFIED'
  if (!validReport(job)) return false
  if (['invalid_limits', 'missing_supervisor'].includes(job.reason)) return job.errorCode === undefined && result.code === 'NOT_VERIFIED'
  return ['launch_failed', 'subreaper_unavailable', 'supervisor_error'].includes(job.reason) &&
    validString(job.errorCode) && job.errorCode.length > 0 && result.code === job.errorCode
}

const isSettledSuccess = result => isSettledResult(result) && result.code === 0 &&
  result.job.outputComplete === true && result.job.hasObservedFailure === false && result.job.rootExit.exitCode === 0

module.exports = { runJob, createRunner, isSettledResult, isNotStartedResult, isSettledSuccess }
