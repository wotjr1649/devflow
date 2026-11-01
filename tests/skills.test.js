'use strict'
// Independent skills ship with the plugin but stay outside the lifecycle (docs/design/current-decisions.md, 독립 스킬):
// the lifecycle never names them and they never mention devflow, so either side can change without the other (#124).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const INDEPENDENT = ['agent-instruction-design', 'audit-prompts', 'decision-interview', 'write-prompts']
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8')
const files = dir => fs.readdirSync(path.join(root, dir), { recursive: true })
  .map(f => path.join(dir, f)).filter(f => f.endsWith('.md'))

test('every skill names itself after its folder', () => {
  for (const name of fs.readdirSync(path.join(root, 'skills'))) {
    const front = read(`skills/${name}/SKILL.md`).split('---')[1]
    assert.match(front, new RegExp(`^name: ${name}$`, 'm'), name)
    assert.match(front, /^description: \S/m, name)
  }
})

test('independent skills ship as SKILL.md and agents/openai.yaml without mentioning devflow', () => {
  for (const name of INDEPENDENT) {
    const entries = fs.readdirSync(path.join(root, 'skills', name), { recursive: true }).map(f => f.replace(/\\/g, '/'))
    assert.deepEqual(entries.sort(), ['SKILL.md', 'agents', 'agents/openai.yaml'], name)
    for (const rel of [`skills/${name}/SKILL.md`, `skills/${name}/agents/openai.yaml`])
      assert.doesNotMatch(read(rel), /devflow|\.devflow\.json|\.\.\//i, rel)
  }
})

test('the lifecycle references and specs do not name the independent skills', () => {
  const lifecycle = [...files('references'), ...files('docs/specs'), ...files('skills/devflow'),
    ...files('skills/development-start'), ...files('skills/pr-review-workflow'), ...files('skills/workspace-cleanup')]
  for (const rel of lifecycle)
    for (const name of INDEPENDENT) assert.ok(!read(rel).includes(name), `${rel} names ${name}`)
})
