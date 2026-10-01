#!/usr/bin/env node
// Checks the repository's own documents: relative links and heading anchors, line endings,
// local absolute paths, and size budgets. Prints "ok" and exits 0 when clean.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? '.';
const files = execFileSync('git', ['-C', root, 'ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((f) => fs.existsSync(path.join(root, f)));
const problems = [];
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
// GitHub heading slug: lowercase, drop punctuation, spaces to hyphens; non-ASCII letters stay.
const slug = (h) => h.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');
const anchors = (f) => new Set(read(f).split('\n').filter((l) => /^#{1,6} /.test(l)).map((l) => slug(l.replace(/^#+ /, ''))));
// Rough token estimate: a Hangul syllable ~1 token, other characters ~4 per token.
const tokens = (s) => { const h = (s.match(/[가-힣]/g) || []).length; return Math.round(h + (s.length - h) / 4); };
const budgets = [[/^AGENTS\.md$/, 1000], [/^docs\/specs\/.+\.md$/, 5000], [/(^|\/)SKILL\.md$/, 5000]];
const localPath = /\b[A-Za-z]:[\\/]|(?:^|[\s'"`(=])\/[a-z]\/[^\s/]+\/|\/home\/[^/\s]+\/|\/Users\/[^/\s]+\//;

for (const f of files) {
  if (f === 'LICENSE' || /\.(png|jpe?g|gif|ico|zip|gz)$/.test(f)) continue;
  const text = read(f);
  if (text.includes('\r')) problems.push(`${f}: CRLF line ending`);
  if (text.charCodeAt(0) === 0xfeff) problems.push(`${f}: byte order mark`);
  text.split('\n').forEach((line, i) => { if (localPath.test(line)) problems.push(`${f}:${i + 1}: local absolute path`); });
  for (const [re, max] of budgets) if (re.test(f) && tokens(text) > max) problems.push(`${f}: ~${tokens(text)} tokens, budget ${max}`);
  if (!f.endsWith('.md')) continue;
  for (const m of text.replace(/```[\s\S]*?```/g, '').matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^[a-z]+:/i.test(m[1])) continue;
    const [p, a] = m[1].split('#');
    const target = p ? path.join(path.dirname(f), p) : f;
    if (!fs.existsSync(path.join(root, target))) { problems.push(`${f}: missing link target ${m[1]}`); continue; }
    if (a && fs.statSync(path.join(root, target)).isFile() && !anchors(target).has(decodeURIComponent(a))) problems.push(`${f}: missing anchor ${m[1]}`);
  }
}
console.log(problems.length ? problems.join('\n') : 'ok');
process.exit(problems.length ? 1 : 0);
