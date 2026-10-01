'use strict'
// SessionStart prints the resume card; PreToolUse blocks Issue writes that bypass devflow-state.
// Both run only in repositories with .devflow.json. Rules: docs/specs/documents.md (Issue I/O, resume card).
const fs = require('fs')
const path = require('path')
const state = require('../bin/devflow-state')

const ISSUE_OPS = /\bgh(?:\.exe)?\s+issue\s+(?:comment|edit|create|new|close|reopen|delete|transfer|lock|unlock|pin|unpin|develop)\b/i
const GH_API = /\bgh(?:\.exe)?\s+api\b[^;&|\n]*/gi
const HTTP_ISSUES = /api\.github\.com\/[^\s'"]*issues/i
const HTTP_WRITE = /(?:-X|--request|-Method)\s*['"]?(?:POST|PATCH|PUT|DELETE)\b|\s(?:-d|--data[\w-]*|--json|-Body)\b/i

// Returns what kind of Issue write the command makes, or null. A guardrail, not a sandbox:
// a command that builds its words at run time gets past it.
function issueWrite(command) {
  const c = Array.isArray(command) ? command.join(' ') : String(command || '')
  if (ISSUE_OPS.test(c)) return 'gh issue write'
  for (const [seg] of c.matchAll(GH_API)) {
    if (/\bgraphql\b/i.test(seg)) {
      // A query read from a file or stdin cannot be checked, so it counts as a mutation.
      if (/\bmutation\b|=@|--input\b/i.test(seg)) return 'gh api graphql mutation'
      continue
    }
    if (!/issues/i.test(seg)) continue
    const method = /(?:-X|--method)[\s=]*([A-Za-z]+)/.exec(seg)
    if (method ? method[1].toUpperCase() !== 'GET' : /\s(?:-f|-F|--field|--raw-field|--input)\b/.test(seg)) return 'gh api Issue write'
  }
  if (HTTP_ISSUES.test(c) && HTTP_WRITE.test(c)) return 'direct GitHub API Issue write'
  return null
}

function isDevflowRepo(dir) {
  for (let d = path.resolve(dir); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.devflow.json'))) return true
    if (path.dirname(d) === d) return false
  }
}

const deny = reason => JSON.stringify({
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
})

// Returns the hook's stdout. PreToolUse fails closed: input it cannot read is denied.
function handle(raw, env = state.realEnv) {
  let input
  try {
    input = JSON.parse(raw)
  } catch {
    return deny('devflow: the hook input could not be read, so the command was not checked for Issue writes.')
  }
  const cwd = input.cwd || process.cwd()
  if (input.hook_event_name === 'SessionStart') {
    let card
    try {
      card = state.card(env, cwd)
    } catch (e) {
      card = `[devflow] resume card failed: ${e.message}`
    }
    return card ? JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: card } }) : ''
  }
  if (input.hook_event_name === 'PreToolUse') {
    try {
      if (!isDevflowRepo(cwd)) return ''
      const kind = issueWrite(input.tool_input && input.tool_input.command)
      return kind ? deny(`devflow: Issue writes go through devflow-state (state, comment, close, reopen, create), which filters ` +
        `paths, secrets and length before posting. Blocked: ${kind}.`) : ''
    } catch (e) {
      return deny(`devflow: the Issue write check failed (${e.message}), so the command was blocked.`)
    }
  }
  return ''
}

function main() {
  let raw = ''
  try {
    raw = fs.readFileSync(0, 'utf8')
  } catch {}
  const out = handle(raw)
  if (out) process.stdout.write(out + '\n')
}

module.exports = { handle, issueWrite, main }
