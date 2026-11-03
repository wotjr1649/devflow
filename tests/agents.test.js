'use strict'
// Pins the agent definitions to the Roles table in skills/devflow/SKILL.md and the host table in
// docs/specs/orchestration.md. The live check reads a
// subagent transcript instead: model, effort, prompt_snapshot.tools and instructions (docs/research/host-facts.md).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const READ = ['Read', 'Grep', 'Glob']
const RUN = [...READ, 'Bash', 'PowerShell']
const EDIT = [...READ, 'Edit', 'Write', 'Bash', 'PowerShell']
const expected = {
  explorer: { model: 'sonnet', effort: 'medium', tools: RUN },
  implementer: { model: 'sonnet', effort: 'medium', tools: EDIT, disallowedTools: ['Agent'], maxTurns: true },
  reviewer: { model: 'opus', effort: 'high', tools: READ },
}

function frontmatter(file) {
  const text = fs.readFileSync(file, 'utf8')
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text)[1]
  return Object.fromEntries(block.split('\n').map(l => /^([\w-]+):\s*(.*)$/.exec(l)).filter(Boolean).map(m => [m[1], m[2]]))
}

const list = v => (v ? v.split(',').map(s => s.trim()) : [])

test('Codex subagents start without the parent conversation in both the spec and the router (#126)', () => {
  const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
  const row = read('docs/specs/orchestration.md').split('\n').find(line => line.startsWith('| Implementer and reviewer agents |'))
  assert.match(row, /fork_turns: "none"/)
  assert.match(read('skills/devflow/SKILL.md'), /Spawn each Codex subagent with `fork_turns: "none"`/)
})

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
