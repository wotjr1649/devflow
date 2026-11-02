'use strict'
// Eval cases (evals/trigger, evals/behavior) must stay well formed and their path/skill patterns must match the
// intended paths only (#133).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const LIFECYCLE = String.raw`"skill"\s*:\s*"devflow:(devflow|development-start|pr-review-workflow|workspace-cleanup)"`

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
      assert.ok(c.graders.some(g => field(g.fm, 'min') === '0' && field(g.fm, 'max') === '0'), `${c.name} needs min 0 and max 0`)
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

test('the lifecycle pattern matches the four lifecycle skills and not decision-interview', () => {
  const re = new RegExp(LIFECYCLE)
  for (const n of ['devflow', 'development-start', 'pr-review-workflow', 'workspace-cleanup'])
    assert.ok(re.test(JSON.stringify({ skill: `devflow:${n}` })), n)
  assert.ok(!re.test(JSON.stringify({ skill: 'devflow:decision-interview' })))
})

const paths = p => [p, p.replace(/\\/g, '/')].map(file_path => JSON.stringify({ file_path }))
const matchesAll = (re, p) => paths(p).every(s => re.test(s))
const matchesNone = (re, p) => paths(p).every(s => !re.test(s))

test('new behavior routing patterns match the devflow references and not the old paths', () => {
  const cases = [
    ['start-new-work', 'routing.md', 'start.md', String.raw`C:\w\skills\development-start\references\tracking.md`],
    ['start-card-failed', 'routing.md', 'start.md', String.raw`C:\w\skills\development-start\references\tracking.md`],
    ['cleanup-merged', 'routing.md', 'cleanup.md', String.raw`C:\w\skills\workspace-cleanup\references\remote-deletion.md`],
    ['cleanup-unmerged', 'routing.md', 'cleanup.md', String.raw`C:\w\skills\workspace-cleanup\references\remote-deletion.md`],
    ['review-only-no-inputs', 'routing.md', 'review.md', String.raw`C:\w\skills\pr-review-workflow\references\review.md`],
    ['review-only-weakened-test', 'routing.md', 'review.md', String.raw`C:\w\skills\pr-review-workflow\references\review.md`],
    ['ship-ci-wrong-revision', 'routing.md', 'ship.md', String.raw`C:\w\references\ship.md`],
    ['ship-ready', 'routing.md', 'ship.md', String.raw`C:\w\references\ship.md`],
  ]
  for (const [name, file, ref, old] of cases) {
    const re = behaviorRe(name, file)
    assert.ok(matchesAll(re, String.raw`C:\w\skills\devflow\references` + '\\' + ref), `${name} new path`)
    assert.ok(matchesNone(re, old), `${name} old path`)
  }
})

test('cleanup skill routing matches the devflow router and not other skills', () => {
  for (const name of ['cleanup-merged', 'cleanup-unmerged']) {
    const re = behaviorRe(name, 'routing-skill.md')
    assert.ok(re.test(JSON.stringify({ skill: 'devflow:devflow' })), name)
    assert.ok(!re.test(JSON.stringify({ skill: 'devflow:decision-interview' })), name)
    assert.ok(!re.test(JSON.stringify({ skill: 'devflow:workspace-cleanup' })), name)
  }
})

test('old patterns behave as documented', () => {
  const tracking = /references[\\/]+tracking\.md/
  assert.ok(matchesAll(tracking, String.raw`C:\w\skills\development-start\references\tracking.md`))
  assert.ok(matchesNone(tracking, String.raw`C:\w\skills\devflow\references\start.md`))

  const cleanupSkill = /"skill"\s*:\s*"devflow:workspace-cleanup"/
  assert.ok(cleanupSkill.test(JSON.stringify({ skill: 'devflow:workspace-cleanup' })))
  assert.ok(!cleanupSkill.test(JSON.stringify({ skill: 'devflow:devflow' })), 'router-only call must not match')

  const cleanupRead = /references[\\/]+(cleanup|remote-deletion)\.md/
  assert.ok(matchesAll(cleanupRead, String.raw`C:\w\skills\workspace-cleanup\references\remote-deletion.md`))
  assert.ok(matchesNone(cleanupRead, String.raw`C:\w\references\other.md`))

  const review = /references[\\/]+review\.md/
  assert.ok(matchesAll(review, String.raw`C:\w\skills\pr-review-workflow\references\review.md`))
  assert.ok(matchesNone(review, String.raw`C:\w\skills\pr-review-workflow\references\tracking.md`))

  const ship = /references[\\/]+(ship|integration)\.md/
  assert.ok(matchesAll(ship, String.raw`C:\w\references\integration.md`))
  assert.ok(matchesNone(ship, String.raw`C:\w\references\review.md`))
})
