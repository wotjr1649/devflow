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
