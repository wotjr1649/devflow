'use strict'
// Pins the agent definitions to the role table in docs/specs/orchestration.md (모델과 effort). The live check reads a
// subagent transcript instead: model, effort, prompt_snapshot.tools and instructions (docs/research/host-facts.md).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const READ = ['Read', 'Grep', 'Glob']
const RUN = [...READ, 'Bash', 'PowerShell']
const EDIT = [...READ, 'Edit', 'Write', 'Bash', 'PowerShell']
const expected = {
  implementer: { model: 'sonnet', effort: 'medium', tools: EDIT, disallowedTools: ['Agent'], maxTurns: true },
  'implementer-deep': { model: 'opus', effort: 'high', tools: EDIT, disallowedTools: ['Agent'], maxTurns: true },
  verifier: { model: 'sonnet', effort: 'medium', tools: RUN },
  diagnostician: { model: 'sonnet', effort: 'high', tools: RUN },
  reviewer: { model: 'opus', effort: 'high', tools: READ },
}

function frontmatter(file) {
  const text = fs.readFileSync(file, 'utf8')
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text)[1]
  return Object.fromEntries(block.split('\n').map(l => /^([\w-]+):\s*(.*)$/.exec(l)).filter(Boolean).map(m => [m[1], m[2]]))
}

const list = v => (v ? v.split(',').map(s => s.trim()) : [])

test('agent definitions match the role table', () => {
  const dir = path.join(__dirname, '..', 'agents')
  const names = fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort()
  assert.deepEqual(names, Object.keys(expected).sort())
  for (const [name, want] of Object.entries(expected)) {
    const fm = frontmatter(path.join(dir, `${name}.md`))
    assert.equal(fm.name, name)
    assert.equal(fm.model, want.model, `${name} model`)
    assert.equal(fm.effort, want.effort, `${name} effort`)
    assert.deepEqual(list(fm.tools), want.tools, `${name} tools`)
    assert.deepEqual(list(fm.disallowedTools), want.disallowedTools || [], `${name} disallowedTools`)
    assert.equal(Boolean(fm.maxTurns), Boolean(want.maxTurns), `${name} maxTurns`)
    assert.ok(!('omitClaudeMd' in fm), `${name} must load the project instructions`)
  }
})
