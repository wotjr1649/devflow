'use strict'
// Pins the agent definitions' tools and limits, and that they follow the skill (#157): each agent is a role of
// skills/devflow/references/roles.md with that role's Claude Code default, and its body holds no role text, which the
// brief carries. The skill's own tests never read agents/. The live check reads a
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

test('agent definitions follow the roles reference and carry no role text (#157)', () => {
  const roles = fs.readFileSync(path.join(__dirname, '../skills/devflow/references/roles.md'), 'utf8')
  const dir = path.join(__dirname, '..', 'agents')
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
    const name = file.slice(0, -3)
    const section = new RegExp(`^## ${name}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(roles)
    assert.ok(section, `${name} is not a role section of roles.md`)
    const def = /^Claude Code default: `model: ([\w.-]+)`, `effort: (\w+)`/m.exec(section[1])
    const fm = frontmatter(path.join(dir, file))
    assert.ok(def, `${name}: roles.md states no Claude Code default`)
    assert.deepEqual([fm.model, fm.effort], [def[1], def[2]], `${name} defaults differ from roles.md`)
    const body = fs.readFileSync(path.join(dir, file), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '')
    assert.doesNotMatch(body, /^#/m, `${name}: the body has a heading, so it holds role text`)
    assert.ok(body.trim().split('\n').length <= 8, `${name}: the body is longer than a pointer and its floor`)
    assert.match(body, /BLOCKED/, `${name}: the body does not stop when the brief carries no role text`)
  }
})
