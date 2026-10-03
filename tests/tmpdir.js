'use strict'
// Every temporary folder a test makes lives under one folder per test process, removed when the process exits, so test
// runs leave nothing behind in the OS temp folder (Issue #16). Use tmpdir(prefix) where fs.mkdtempSync would be used.
const fs = require('fs')
const os = require('os')
const path = require('path')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-test-'))
process.on('exit', () => {
  try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }) } catch {}
})

const tmpdir = prefix => fs.mkdtempSync(path.join(root, prefix))
tmpdir.root = root
module.exports = tmpdir
