'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { get_encoding } = require('tiktoken')

const skill = path.join(__dirname, '..', 'skills', 'devflow')
const files = ['SKILL.md', ...fs.readdirSync(path.join(skill, 'references'))
  .filter(file => file.endsWith('.md')).sort().map(file => path.join('references', file))]
const limit = 2000
const encoder = get_encoding('o200k_base')

try {
  let total = 0
  for (const file of files) {
    const text = fs.readFileSync(path.join(skill, file), 'utf8').replace(/\r\n/g, '\n')
    const count = encoder.encode(text, [], []).length
    console.log(`${file}: ${count}`)
    total += count
  }
  console.log(`Devflow: ${total}/${limit} o200k_base tokens`)
  if (total > limit) process.exitCode = 1
} finally {
  encoder.free()
}
