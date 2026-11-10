#!/usr/bin/env node
// Serves <dir>/quiz.html and saves every answer to <dir>/answers.json
// (latest state) and <dir>/answers.log (one line per save).
// Usage: node server.cjs <dir> [port]   HOST defaults to 127.0.0.1.
const http = require('http')
const fs = require('fs')
const path = require('path')

const dir = path.resolve(process.argv[2] || '.')
const port = Number(process.argv[3] || process.env.PORT || 8791)
const host = process.env.HOST || '127.0.0.1'
const page = path.join(dir, 'quiz.html')
if (!fs.existsSync(page)) {
  console.error(`No quiz.html in ${dir}. Run build.cjs first.`)
  process.exit(1)
}

http.createServer((req, res) => {
  const url = req.url.split('?')[0]
  if (req.method === 'POST' && url.endsWith('/answers')) {
    let body = ''
    req.on('data', (c) => { body += c; if (body.length > 2e6) req.destroy() })
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        const saved = { savedAt: new Date().toISOString(), ...data }
        const file = path.join(dir, 'answers.json')
        // "Start over" sends an empty state. Keep the old answers instead of wiping them.
        const count = (d) => Object.keys((d && d.state && d.state.answers) || {}).length
        let prev = null
        try { prev = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
        if (count(prev) > 0 && count(data) === 0) {
          fs.renameSync(file, path.join(dir, `answers.${prev.savedAt.replace(/[:.]/g, '-')}.json`))
        }
        fs.writeFileSync(file, JSON.stringify(saved, null, 2))
        fs.appendFileSync(path.join(dir, 'answers.log'),
          JSON.stringify({ at: saved.savedAt, i: data.state && data.state.i }) + '\n')
        res.writeHead(204).end()
      } catch { res.writeHead(400).end() }
    })
    return
  }
  if (req.method === 'GET' && (url === '/' || url === '/quiz.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    return res.end(fs.readFileSync(page))
  }
  res.writeHead(404).end()
}).listen(port, host, () => console.log(`quiz on http://${host}:${port}`))
