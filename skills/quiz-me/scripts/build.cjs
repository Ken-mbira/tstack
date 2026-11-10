#!/usr/bin/env node
// Checks <dir>/questions.js and <dir>/rubrics.md, then writes <dir>/quiz.html.
// Usage: node build.cjs <dir> "<Quiz title>"
const fs = require('fs')
const path = require('path')

const dir = path.resolve(process.argv[2] || '.')
const title = process.argv[3] || 'Quiz'
const template = fs.readFileSync(path.join(__dirname, '..', 'assets', 'quiz.template.html'), 'utf8')

// The page and this check share one shuffle, so the check sees what the user sees.
const ORDER_SRC = `// Stable shuffle per question so the right answer isn't always in one place.
function order(q) {
  let h = 2166136261
  for (const c of q.id + '|v2') h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  const rand = () => { h = (h + 0x6d2b79f5) >>> 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const idx = q.options.map((_, k) => k)
  for (let k = idx.length - 1; k > 0; k--) {
    const j = Math.floor(rand() * (k + 1))
    ;[idx[k], idx[j]] = [idx[j], idx[k]]
  }
  return idx
}`
const order = new Function(`${ORDER_SRC}; return order`)()

const errors = []
const warnings = []
const qPath = path.join(dir, 'questions.js')
delete require.cache[qPath]
const questions = require(qPath)
if (!Array.isArray(questions) || questions.length === 0) errors.push('questions.js must export a non-empty array')

const rubricPath = path.join(dir, 'rubrics.md')
const rubrics = fs.existsSync(rubricPath) ? fs.readFileSync(rubricPath, 'utf8') : ''
const seen = new Set()
for (const [n, q] of (questions || []).entries()) {
  const at = `Q${n + 1} ${q.id || '(no id)'}`
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(q.id || '')) errors.push(`${at}: id must be lowercase words joined by hyphens`)
  if (seen.has(q.id)) errors.push(`${at}: duplicate id`)
  seen.add(q.id)
  if (!q.text || !String(q.text).trim()) errors.push(`${at}: no text`)
  if (q.type === 'open') {
    if (!new RegExp(`^##\\s+${q.id}\\b`, 'm').test(rubrics)) errors.push(`${at}: no "## ${q.id}" section in rubrics.md`)
    continue
  }
  if (q.type !== 'single' && q.type !== 'multi') { errors.push(`${at}: type must be single, multi, or open`); continue }
  if (!Array.isArray(q.options) || q.options.length < 3 || q.options.length > 6) errors.push(`${at}: needs 3-6 options`)
  const c = Array.isArray(q.correct) ? q.correct : []
  if (c.length === 0 || c.some((k) => !Number.isInteger(k) || k < 0 || k >= (q.options || []).length)) errors.push(`${at}: correct must list valid option indexes`)
  if (q.type === 'single' && c.length !== 1) errors.push(`${at}: single needs exactly one correct answer`)
  if (new Set(q.options || []).size !== (q.options || []).length) errors.push(`${at}: duplicate options`)
  if (!q.why || !String(q.why).trim()) errors.push(`${at}: no why`)
}

// Where the right answer lands after shuffling, and whether it gives itself away by length.
const single = (questions || []).filter((q) => q.type === 'single' && Array.isArray(q.options) && Array.isArray(q.correct) && q.correct.length === 1)
const slots = {}
let longest = 0
for (const q of single) {
  const slot = order(q).indexOf(q.correct[0])
  slots[slot] = (slots[slot] || 0) + 1
  const lens = q.options.map((o) => String(o).length)
  const mine = lens[q.correct[0]]
  if (lens.every((l, k) => k === q.correct[0] || l < mine)) longest++
}
if (single.length >= 6) {
  const max = Math.max(...Object.values(slots))
  if (max > Math.ceil(single.length / 2)) errors.push(`right answers bunch in one slot after shuffling: ${JSON.stringify(slots)}. Change some ids or option order.`)
  if (longest > single.length / 3) warnings.push(`the right answer is the longest option in ${longest} of ${single.length} pick-one questions. Even out option lengths.`)
}

if (errors.length) {
  console.error('Not built:\n- ' + errors.join('\n- '))
  process.exit(1)
}

const initial = (title.trim()[0] || 'Q').toUpperCase()
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const key = 'quiz-' + path.basename(dir).replace(/[^a-z0-9-]/gi, '') + '-v1'
const html = template
  .replace('/*__QUESTIONS__*/', () => `const QUESTIONS = ${JSON.stringify(questions, null, 2).replace(/<\//g, '<\\/')}`)
  .replace('/*__ORDER__*/', () => ORDER_SRC)
  .replace(/__TITLE_JSON__/g, () => JSON.stringify(title).replace(/<\//g, '<\\/'))
  .replace(/__TITLE__/g, () => esc(title))
  .replace(/__INITIAL__/g, () => esc(initial))
  .replace(/__KEY__/g, () => key)
fs.writeFileSync(path.join(dir, 'quiz.html'), html)

const open = (questions || []).filter((q) => q.type === 'open').length
console.log(`Built ${path.join(dir, 'quiz.html')}: ${questions.length} questions, ${open} written. Right-answer slots: ${JSON.stringify(slots)}`)
if (warnings.length) console.log('Warnings:\n- ' + warnings.join('\n- '))
