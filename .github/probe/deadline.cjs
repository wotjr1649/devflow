// Temporary probe for Issue #37: runs the PreToolUse entry point on the deadline case N times and prints the phases.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync, execFileSync } = require('child_process')
const hook = path.resolve(__dirname, '../../hooks/devflow-hook.js')
const runs = Number(process.argv[2] || 20)
const d = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'deadline-')))
fs.writeFileSync(path.join(d, '.devflow.json'), JSON.stringify({ protected: ['_ref/**'] }))
const git = (...a) => execFileSync('git', ['-C', d, ...a], { stdio: 'ignore' })
git('init', '-q'); git('add', '.devflow.json'); git('commit', '-q', '-m', 'a'); git('switch', '-q', '-c', 'fix/7-deadline')
fs.writeFileSync(path.join(d, 'heavy.sh'), 'echo ok\n'.repeat(8000))
const command = 'bash heavy.sh;'.repeat(15000) + 'gh issue close 1'
const input = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: d })
const totals = []
for (let i = 0; i < runs; i++) {
  const t = Date.now()
  const at = new Date(t).toISOString()
  const r = spawnSync(process.execPath, ['-e', 'require(process.argv[1]).main()', hook], {
    cwd: d, input, encoding: 'utf8', timeout: 30000, env: { ...process.env, DEVFLOW_HOOK_TIMING: '1' },
  })
  const ms = Date.now() - t
  totals.push(ms)
  const phases = (r.stderr || '').split('\n').filter(l => l.startsWith('devflow-timing')).map(l => l.slice(15)).join(' | ')
  console.log(`run ${i + 1} @${at}: total ${ms} ms, status ${r.status}, deny ${/"deny"/.test(r.stdout || '')} :: ${phases}`)
}
totals.sort((a, b) => a - b)
console.log(`min ${totals[0]} median ${totals[Math.floor(totals.length / 2)]} max ${totals[totals.length - 1]}`)
fs.rmSync(d, { recursive: true, force: true })
