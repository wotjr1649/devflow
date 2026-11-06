#!/usr/bin/env node
'use strict'

// Offline comparison only. This does not launch a model, infer missing usage, or turn a token estimate into billing.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const canonical = value => Array.isArray(value) ? value.map(canonical) :
  value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
const count = n => Number.isSafeInteger(n) && n >= 0
const requiredControls = ['fixture', 'host', 'hostVersion', 'model', 'effort', 'permissions', 'cacheCondition']

function summarize(run) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) throw new Error('a run must be an object')
  if (!run.control || requiredControls.some(k => typeof run.control[k] !== 'string' || !run.control[k].trim()))
    throw new Error('complete fixture/host/model/effort/permission/cache controls are required')
  if (!['pass', 'fail', 'unknown'].includes(run.outcome)) throw new Error('outcome must be pass, fail or unknown')
  if (!Array.isArray(run.violations) || run.violations.some(v => typeof v !== 'string')) throw new Error('violations must be an array of strings')
  if (typeof run.oracleRef !== 'string' || !run.oracleRef.trim()) throw new Error('an independently assessed outcome reference is required')
  if (!Array.isArray(run.requests)) throw new Error('requests must be an array')
  const totals = { uncachedInput: 0, cacheRead: 0, cacheWrite: 0, output: 0 }
  const ids = new Set()
  const gaps = []
  for (const r of run.requests) {
    if (!r || typeof r.requestId !== 'string' || !r.requestId || ids.has(r.requestId)) throw new Error('request IDs must be present and unique')
    ids.add(r.requestId)
    if (!['main', 'subagent', 'hook'].includes(r.role)) throw new Error('request role must be main, subagent or hook')
    if (typeof r.sourceRef !== 'string' || !r.sourceRef.trim()) throw new Error('each request needs its observed usage source')
    // The importer must normalize provider counters into disjoint buckets. Completion-context footprints are not requests.
    if (r.counterBasis !== 'disjoint-request-usage') throw new Error('normalize actual request usage into disjoint buckets first')
    for (const key of Object.keys(totals)) {
      if (r[key] === null || r[key] === undefined) { gaps.push(`${r.requestId}:${key}`); continue }
      if (!count(r[key])) throw new Error(`${key} must be a nonnegative safe integer or null`)
      totals[key] += r[key]
      if (!Number.isSafeInteger(totals[key])) throw new Error('usage total exceeds safe integer range')
    }
  }
  for (const role of ['main', 'subagent', 'hook']) {
    if (!run.coverage || run.coverage[role] !== true) gaps.push(`coverage:${role}`)
  }
  if (!run.requests.length) gaps.push('no observed requests')
  const complete = gaps.length === 0
  const observedTotal = Object.values(totals).reduce((a, b) => a + b, 0)
  if (!Number.isSafeInteger(observedTotal)) throw new Error('usage total exceeds safe integer range')
  return { control: run.control, outcome: run.outcome, violations: run.violations, oracleRef: run.oracleRef,
    requests: ids.size, usageComplete: complete, observedBuckets: totals, totalTokens: complete ? observedTotal : null,
    elapsedSeconds: typeof run.elapsedSeconds === 'number' && Number.isFinite(run.elapsedSeconds) && run.elapsedSeconds >= 0 ? run.elapsedSeconds : null,
    gaps }
}

function compare(baseline, candidate) {
  const before = summarize(baseline)
  const after = summarize(candidate)
  const reasons = []
  if (!same(before.control, after.control)) reasons.push('controls differ')
  if ([before, after].some(r => r.outcome !== 'pass' || r.violations.length)) reasons.push('equal-success/authority condition is not met')
  if (!before.usageComplete || !after.usageComplete) reasons.push('request usage coverage is incomplete')
  return { status: reasons.length ? 'NOT_COMPARABLE' : 'COMPARABLE', reasons, before, after,
    tokenDelta: reasons.length ? null : after.totalTokens - before.totalTokens,
    tokenReductionPercent: reasons.length || before.totalTokens === 0 ? null :
      100 * (before.totalTokens - after.totalTokens) / before.totalTokens }
}

function instructions(skillRoot) {
  const profiles = {
    entry: ['SKILL.md'],
    build: ['SKILL.md', 'references/build.md'],
    delegatedBuild: ['SKILL.md', 'references/build.md', 'references/delegation.md', 'references/role-implementer.md'],
    finalReview: ['SKILL.md', 'references/review.md', 'references/delegation.md', 'references/role-reviewer.md'],
    resumedBuild: ['SKILL.md', 'references/sessions.md', 'references/build.md', 'references/delegation.md', 'references/role-implementer.md'],
  }
  // The baseline has a combined roles document. Preserve its actual load cost when comparing the two layouts.
  if (fs.existsSync(path.join(skillRoot, 'references/roles.md')))
    for (const key of ['delegatedBuild', 'finalReview', 'resumedBuild'])
      profiles[key] = [...new Set(profiles[key].map(p => /references\/(delegation|role-[^/]+)\.md$/.test(p) ? 'references/roles.md' : p))]
  const result = {}
  for (const [name, files] of Object.entries(profiles)) {
    const entries = [...new Set(files)].map(file => {
      const bytes = fs.readFileSync(path.join(skillRoot, file))
      return { file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }
    })
    result[name] = { bytes: entries.reduce((sum, f) => sum + f.bytes, 0), files: entries }
  }
  return { kind: 'static-instruction-bytes', note: 'Unique file bytes per selected path; not model tokens, billed cost, or observed loading.', profiles: result }
}

if (require.main === module) {
  try {
    const [command, a, b, ...extra] = process.argv.slice(2)
    if (extra.length || (command === 'instructions' && (!a || b)) || (command === 'compare' && (!a || !b))) throw new Error('invalid arguments')
    const result = command === 'instructions' ? instructions(path.resolve(a)) :
      command === 'compare' ? compare(JSON.parse(fs.readFileSync(a, 'utf8')), JSON.parse(fs.readFileSync(b, 'utf8'))) : null
    if (!result) throw new Error('usage: node evals/measure.js instructions <skill-directory> | compare <baseline.json> <candidate.json>')
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  } catch (e) { process.stderr.write(e.message + '\n'); process.exitCode = 1 }
}

module.exports = { summarize, compare, instructions }
