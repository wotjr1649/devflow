'use strict'
// Disposable transport for real CLI process tests. No network access.
const fs = require('node:fs')
const file = process.env.DEVFLOW_TEST_REMOTE
const value = JSON.parse(fs.readFileSync(file, 'utf8'))
const args = process.argv.slice(2)
const save = () => fs.writeFileSync(file, JSON.stringify(value))
const reply = data => { process.stdout.write(typeof data === 'string' ? data : JSON.stringify(data)); process.exit(0) }
if (args[0] === 'api' && args.includes('user')) reply('runtime-owner\n')
if (args[0] === 'api' && args.includes('--paginate')) {
  const list = args.at(-1).includes('/comments?')
    ? value.issue.comments.nodes.map(c => ({ html_url: c.url, body: c.body, created_at: c.createdAt, user: { login: c.author?.login || 'runtime-owner' } }))
    : value.created || []
  if (value.mode === 'missing-executable') fs.unlinkSync(process.argv[1])
  reply([list])
}
if (args[0] === 'api') reply({ data: { repository: { issue: value.issue } } })
if (args[0] === 'auth') reply('')
if (args[0] === 'issue' && ['comment', 'edit', 'close', 'reopen', 'create'].includes(args[1])) {
  value.writes++; save()
  if (value.mode === 'authfail') { process.stderr.write('authentication required before sending'); process.exit(4) }
  if (['timeout', 'concurrent-timeout', 'returned-live-child'].includes(value.mode)) {
    const input = fs.readFileSync(0, 'utf8'), path = require('node:path'), { spawn } = require('node:child_process')
    const marker = label => path.join(path.dirname(file), 'transport-' + label + '-complete')
    const worker = `const fs=require('node:fs');const [file,delay,id,body,marker]=process.argv.slice(1);setTimeout(()=>{if(id){const v=JSON.parse(fs.readFileSync(file,'utf8'));v.issue.comments.nodes.push({url:v.issue.url+'#issuecomment-'+id,body,author:{login:'runtime-owner'},authorAssociation:'OWNER',createdAt:new Date().toISOString()});fs.writeFileSync(file,JSON.stringify(v))}fs.writeFileSync(marker,'finished');process.exit(0)},Number(delay))`
    const launch = (delay, id, label) => {
      const child = spawn(process.execPath, ['-e', worker, file, String(delay), id, input, marker(label)], { detached: true, stdio: 'ignore' })
      child.unref(); return child.pid
    }
    const pids = { root: process.pid }
    if (value.mode === 'concurrent-timeout') { pids.other = launch(100, '8', 'other'); pids.own = launch(13500, '9', 'own') }
    if (value.mode === 'returned-live-child') {
      pids.own = launch(13500, '', 'own')
      value.issue.comments.nodes.push({ url: value.issue.url + '#issuecomment-9', body: input, author: { login: 'runtime-owner' },
        authorAssociation: 'OWNER', createdAt: new Date().toISOString() })
      save()
    }
    fs.writeFileSync(path.join(path.dirname(file), 'transport-pids.json'), JSON.stringify(pids))
    if (value.mode === 'returned-live-child') { fs.writeFileSync(marker('root'), 'finished'); reply(value.issue.url + '#issuecomment-9') }
    else setTimeout(() => { fs.writeFileSync(marker('root'), 'finished'); process.exit(1) }, 12000)
  }
  else {
    const input = fs.readFileSync(0, 'utf8')
    let url = value.issue.url
    if (args[1] === 'comment') {
      url += '#issuecomment-' + value.writes
      value.issue.comments.nodes.push({ body: input, authorAssociation: 'OWNER', author: { login: 'runtime-owner' }, createdAt: new Date().toISOString(), url })
    }
    if (args[1] === 'edit') value.issue.body = input
    if (args[1] === 'close') value.issue.state = 'CLOSED'
    if (args[1] === 'reopen') value.issue.state = 'OPEN'
    save(); reply(url)
  }
} else { process.stderr.write('unsupported fixture request'); process.exit(1) }
