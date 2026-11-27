'use strict'
// Eval cases (evals/trigger, evals/behavior) must stay well formed and their path/skill patterns must match the
// intended paths only (#133).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const LIFECYCLE = String.raw`"skill"\s*:\s*"devflow:devflow"`

const front = text => {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  return m ? m[1] : null
}
const field = (fm, key) => {
  const m = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(fm)
  return m ? m[1].trim() : undefined
}
const tagsOf = fm => (field(fm, 'tags') || '').replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean)
const unquote = v => v.replace(/^'([\s\S]*)'$/, '$1').replace(/''/g, "'")

const load = kind => {
  const base = path.join(root, 'evals', kind)
  return fs.readdirSync(base).map(name => {
    const dir = path.join(base, name)
    const prompt = fs.readFileSync(path.join(dir, 'prompt.md'), 'utf8')
    const gdir = path.join(dir, 'graders')
    const graders = fs.existsSync(gdir) ? fs.readdirSync(gdir).map(f => {
      const text = fs.readFileSync(path.join(gdir, f), 'utf8')
      return { file: f, fm: front(text), text }
    }) : []
    return { name, prompt, fm: front(prompt), tags: front(prompt) ? tagsOf(front(prompt)) : [], graders }
  })
}
const trigger = load('trigger')
const behavior = load('behavior')
const inputMatch = g => unquote(field(g.fm, 'input_match'))
const graderRe = (c, file) => new RegExp(inputMatch(c.graders.find(g => g.file === file)))
const behaviorRe = (name, file) => graderRe(behavior.find(c => c.name === name), file)

test('every eval case has tags and every grader has a type', () => {
  for (const [kind, cases] of [['trigger', trigger], ['behavior', behavior]])
    for (const c of cases) {
      assert.ok(c.fm, `${c.name} has no frontmatter`)
      assert.equal(c.tags[0], kind, `${c.name} first tag`)
      if (kind === 'trigger') assert.ok(['should', 'should-not'].includes(c.tags[1]), `${c.name} second tag`)
      for (const g of c.graders) {
        assert.ok(g.fm, `${c.name}/${g.file} has no frontmatter`)
        assert.ok(field(g.fm, 'type'), `${c.name}/${g.file} has no type`)
      }
    }
})

test('should-not trigger cases have a zero-call grader and should cases a Skill grader that allows calls', () => {
  for (const c of trigger) {
    const skill = c.graders.filter(g => field(g.fm, 'type') === 'tool_used' && field(g.fm, 'tool') === 'Skill')
    if (c.tags.includes('should-not'))
      assert.ok(skill.some(g => field(g.fm, 'min') === '0' && field(g.fm, 'max') === '0'), `${c.name} needs a zero-call Skill grader`)
    else
      assert.ok(skill.some(g => field(g.fm, 'max') !== '0'), `${c.name} needs a firing Skill grader`)
  }
})

test('lifecycle trigger cases use exactly the lifecycle pattern', () => {
  const cases = trigger.filter(c => c.name.startsWith('devflow--'))
  assert.ok(cases.length > 0)
  for (const c of cases) {
    assert.ok(c.graders.length > 0, c.name)
    for (const g of c.graders) assert.equal(inputMatch(g), LIFECYCLE, `${c.name}/${g.file}`)
  }
})

test('independent and none trigger cases carry a lifecycle-quiet grader', () => {
  // A request that also asks to start lifecycle work may fire devflow after the independent skill.
  const mixed = 'decision-interview--card-grill-then-start'
  const cases = trigger.filter(c => c.name !== mixed &&
    /^(agent-instruction-design|audit-prompts|decision-interview|write-prompts|none)--/.test(c.name))
  for (const c of cases) {
    const g = c.graders.find(x => x.file === 'devflow-quiet.md')
    assert.ok(g, `${c.name} lacks devflow-quiet.md`)
    assert.equal(inputMatch(g), LIFECYCLE, c.name)
    assert.equal(field(g.fm, 'min'), '0', c.name)
    assert.equal(field(g.fm, 'max'), '0', c.name)
  }
})

test('the lifecycle pattern matches only the shipped Devflow entry point', () => {
  const re = new RegExp(LIFECYCLE)
  const shipped = fs.readdirSync(path.join(root, 'skills'))
    .filter(name => fs.existsSync(path.join(root, 'skills', name, 'SKILL.md')))
  const names = [...shipped, 'development-start', 'pr-review-workflow', 'workspace-cleanup', 'devflow-extra']
  const matching = names.filter(name => re.test(JSON.stringify({ skill: 'devflow:' + name })))
  assert.deepEqual(matching, ['devflow'])
  assert.ok(!re.test(JSON.stringify({ skill: 'other:devflow' })))
})

const routeMetrics = {
  'change.md': [
    'build-brief', 'build-brief-test-removal', 'design-acceptance-change', 'design-self-fix',
    'review-only-no-inputs', 'review-only-weakened-test', 'start-card-failed', 'start-new-work',
  ],
  'delivery.md': ['cleanup-merged', 'cleanup-unmerged', 'ship-autonomous', 'ship-ci-wrong-revision', 'ship-ready'],
  'resume.md': ['session-warning-hold', 'session-warning-none'],
}
const references = fs.readdirSync(path.join(root, 'skills', 'devflow', 'references'))
const metricPath = name => 'skills/devflow/references/' + name
const pathInputs = filePath => [filePath.replace(/\\/g, '/'), filePath.replace(/\//g, '\\')]
  .map(file_path => JSON.stringify({ file_path }))
const matchesAll = (re, filePath) => pathInputs(filePath).every(input => re.test(input))
const matchesNone = (re, filePath) => pathInputs(filePath).every(input => !re.test(input))

test('behavior routing metrics match the current reference on both platforms', () => {
  const expected = Object.values(routeMetrics).flat()
  const cases = behavior.filter(c => c.graders.some(g => g.file === 'routing.md'))
  assert.deepEqual(cases.map(c => c.name).sort(), expected.sort())
  for (const [ref, names] of Object.entries(routeMetrics)) {
    assert.ok(references.includes(ref), ref)
    for (const name of names) {
      const c = cases.find(c => c.name === name)
      const g = c.graders.find(g => g.file === 'routing.md')
      assert.equal(field(g.fm, 'type'), 'tool_used', name)
      assert.equal(field(g.fm, 'tool'), 'Read', name)
      assert.equal(field(g.fm, 'arm'), 'with-only', name)
      const re = new RegExp(inputMatch(g))
      assert.ok(matchesAll(re, metricPath(ref)), name)
      assert.ok(matchesAll(re, path.join(root, metricPath(ref))), name)
    }
  }
})

test('behavior skill routing metrics match only the Devflow entry point', () => {
  const cases = behavior.filter(c => c.graders.some(g => g.file === 'routing-skill.md'))
  assert.ok(cases.length > 0)
  for (const c of cases) {
    const g = c.graders.find(g => g.file === 'routing-skill.md')
    assert.equal(field(g.fm, 'type'), 'tool_used', c.name)
    assert.equal(field(g.fm, 'tool'), 'Skill', c.name)
    assert.equal(field(g.fm, 'arm'), 'with-only', c.name)
    assert.equal(inputMatch(g), LIFECYCLE, c.name)
  }
})

test('behavior routing metrics reject unrelated or similarly named references', () => {
  for (const [ref, names] of Object.entries(routeMetrics)) {
    const unrelated = [
      ...references.filter(name => name !== ref).map(metricPath),
      'skills/another-skill/references/' + ref,
      'not-skills/devflow/references/' + ref,
      'docs/references/' + ref,
      metricPath(ref) + '.backup',
    ]
    for (const name of names) {
      const re = behaviorRe(name, 'routing.md')
      for (const other of unrelated) assert.ok(matchesNone(re, other), name + ': ' + other)
    }
  }
})
