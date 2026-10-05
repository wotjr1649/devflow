'use strict'
// Pins .devflow.json: every highRisk path has a checks entry, so build is told which check runs when it changes.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.devflow.json'), 'utf8'))

test('every highRisk path has a checks entry', () => {
  assert.deepEqual(config.highRisk.filter(p => !(p in config.checks)), [])
})

test('both plugin manifests carry the same release version (#51)', () => {
  const manifest = host => JSON.parse(fs.readFileSync(path.join(__dirname, '..', host + '-plugin/plugin.json'), 'utf8'))
  const claude = manifest('.claude').version
  assert.match(claude, /^0\.\d+\.\d+$/)
  assert.equal(manifest('.codex').version, claude)
})
