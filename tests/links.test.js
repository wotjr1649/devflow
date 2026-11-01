'use strict'
// Every relative Markdown link in the tracked files resolves to a file and, when it names one, to a heading anchor as
// GitHub renders it. A moved file or a renamed heading otherwise fails silently: the agent reading the link gets nothing.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = path.join(__dirname, '..')

// GitHub's heading anchor: lowercase, drop every character that is not a letter, mark, number, connector, space or
// hyphen, then turn each space into a hyphen; a repeated anchor gets -1, -2 and so on.
function slug(heading) {
  return heading.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-')
}

// Lines outside fenced code blocks; fenced lines become empty so neither their links nor their headings count.
function unfenced(text) {
  const out = []
  let fence = null
  for (const line of text.split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)
    if (marker) {
      if (!fence) fence = marker[1][0]
      else if (marker[1][0] === fence) fence = null
      out.push('')
    } else out.push(fence ? '' : line)
  }
  return out
}

// Inline code spans are emptied so their brackets are not read as links.
const prose = text => unfenced(text).map(line => line.replace(/`[^`]*`/g, '``'))

function anchors(file) {
  const seen = new Map()
  const result = new Set()
  for (const line of unfenced(fs.readFileSync(file, 'utf8'))) {
    const m = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)
    if (!m) continue
    // A heading keeps the text of its code spans and links; only the markup goes.
    const text = m[1].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*`]/g, '')
    const base = slug(text)
    const n = seen.get(base) || 0
    seen.set(base, n + 1)
    result.add(n ? `${base}-${n}` : base)
  }
  return result
}

function links(file) {
  const found = []
  prose(fs.readFileSync(file, 'utf8')).forEach((line, i) => {
    for (const m of line.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      const target = m[1]
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue
      found.push({ line: i + 1, target })
    }
  })
  return found
}

const tracked = execFileSync('git', ['ls-files', '-z', '--', '*.md'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(Boolean)

test('GitHub heading anchors follow the observed slugs', () => {
  // Observed on github.com for headings in this repository (2026-11-01).
  assert.equal(slug('M0의 적용과 마무리'), 'm0의-적용과-마무리')
  assert.equal(slug('.devflow.json'), 'devflowjson')
  assert.equal(slug('프로젝트 AGENTS.md 형식'), '프로젝트-agentsmd-형식')
  assert.equal(slug('통합과 CI'), '통합과-ci')
  assert.equal(slug('Issue 폴더'), 'issue-폴더')
})

test('every relative link in tracked Markdown resolves to a file and heading', () => {
  const broken = []
  let checked = 0
  for (const rel of tracked) {
    const file = path.join(root, rel)
    for (const { line, target } of links(file)) {
      checked++
      const [raw, fragment] = target.split('#')
      // A leading slash is the repository root on GitHub, not the file system root.
      const base = raw.startsWith('/') ? root : path.dirname(file)
      const dest = raw ? path.join(base, decodeURIComponent(raw)) : file
      const where = `${rel}:${line} -> ${target}`
      if (!fs.existsSync(dest)) { broken.push(`${where} (no such file)`); continue }
      if (fragment !== undefined && fs.statSync(dest).isFile() && dest.endsWith('.md')
        && !anchors(dest).has(decodeURIComponent(fragment))) broken.push(`${where} (no such heading)`)
    }
  }
  assert.ok(checked > 100, `expected the repository's links, found ${checked}`)
  assert.deepEqual(broken, [], `broken links; fix the link or the heading it names:\n${broken.join('\n')}`)
})
