'use strict'
// Issue #16: test runs leave nothing behind in the OS temp folder.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

test('a test process removes its temporary folders when it exits, git repositories included', () => {
  const script = `const t = require(${JSON.stringify(path.join(__dirname, 'tmpdir.js'))});` +
    `const d = t('x-'); require('fs').mkdirSync(require('path').join(d, 'a', 'b'), { recursive: true });` +
    `require('child_process').spawnSync('git', ['init', '-q'], { cwd: d });` +
    `require('fs').writeFileSync(require('path').join(d, 'a', 'b', 'f'), 'x'); process.stdout.write(t.root)`
  const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.ok(r.stdout.length > 0)
  assert.equal(fs.existsSync(r.stdout), false, 'the per-process folder is gone')
})

test('no test file makes folders in the OS temp folder directly', () => {
  for (const f of fs.readdirSync(__dirname).filter(n => n.endsWith('.js') && !['tmpdir.js', 'tmpdir.test.js'].includes(n))) {
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, f), 'utf8'), /os\.tmpdir\(\)/, `${f} uses os.tmpdir(); use require('./tmpdir')`)
  }
})
