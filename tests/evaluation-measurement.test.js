'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { summarize, compare } = require('../evals/measure')

const run = () => ({
  control: { fixture: 'partial-delivery-v1', host: 'test-host', hostVersion: '1', model: 'fixed-model-id',
    effort: 'fixed', permissions: 'read-only', cacheCondition: 'cold' },
  outcome: 'pass', violations: [], oracleRef: 'private/oracle.json',
  coverage: { main: true, subagent: true, hook: true }, elapsedSeconds: 2,
  requests: [{ requestId: 'request-1', role: 'main', sourceRef: 'private/usage.json',
    counterBasis: 'disjoint-request-usage', uncachedInput: 100, cacheRead: 50, cacheWrite: 25, output: 10 }]
})

test('usage sums disjoint request buckets and includes children and hooks', () => {
  const r = run()
  r.requests.push({ ...r.requests[0], requestId: 'request-2', role: 'subagent' },
    { ...r.requests[0], requestId: 'request-3', role: 'hook' })
  assert.equal(summarize(r).totalTokens, 555)
})

test('a completion context footprint cannot be treated as total request usage', () => {
  const r = run()
  r.requests[0].counterBasis = 'subagent_completed.total_tokens'
  assert.throws(() => summarize(r), /actual request usage/)
})

test('unknown counters and unobserved hook usage remain unknown rather than zero', () => {
  const r = run()
  r.requests[0].cacheRead = null
  r.coverage.hook = false
  const s = summarize(r)
  assert.equal(s.totalTokens, null)
  assert.deepEqual(s.gaps, ['request-1:cacheRead', 'coverage:hook'])
  assert.equal(compare(run(), r).tokenDelta, null)
})

test('duplicate request IDs are rejected to prevent double counting', () => {
  const r = run()
  r.requests.push({ ...r.requests[0] })
  assert.throws(() => summarize(r), /unique/)
})

test('lower usage after early failure or an authority violation is not a saving', () => {
  for (const change of [r => { r.outcome = 'fail' }, r => { r.violations = ['unapproved write'] }]) {
    const r = run()
    r.requests[0].uncachedInput = 1
    change(r)
    const result = compare(run(), r)
    assert.equal(result.status, 'NOT_COMPARABLE')
    assert.equal(result.tokenReductionPercent, null)
  }
})

test('model, permission or cache differences cannot be averaged into a matched comparison', () => {
  for (const k of ['model', 'permissions', 'cacheCondition']) {
    const r = run()
    r.control[k] = 'different'
    assert.equal(compare(run(), r).status, 'NOT_COMPARABLE')
  }
})

test('matched successful complete runs expose the measured token difference', () => {
  const r = run()
  r.requests[0].uncachedInput = 80
  const result = compare(run(), r)
  assert.equal(result.status, 'COMPARABLE')
  assert.equal(result.tokenDelta, -20)
  assert.ok(result.tokenReductionPercent > 10 && result.tokenReductionPercent < 11)
})
