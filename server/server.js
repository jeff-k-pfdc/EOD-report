import express from 'express'
import { randomBytes } from 'crypto'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { config as loadEnv } from 'dotenv'
import { sendToTelegram } from './telegram.js'
import * as storage from './storage.js'
import { scheduleAutoSend } from './scheduler.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

loadEnv({ path: join(__dirname, '..', '.env') })

const app  = express()
const PORT = process.env.PORT || 3001

const APP_PASSWORD  = process.env.APP_PASSWORD || ''
const SESSION_TOKEN = randomBytes(32).toString('hex')

app.use(express.json())

// ── Auth ─────────────────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (!APP_PASSWORD) return next()
  const auth = req.headers['authorization'] || ''
  if (auth === `Bearer ${SESSION_TOKEN}`) return next()
  res.status(401).json({ error: 'Unauthorized' })
}

// Protect all /api/* except /api/login and /api/auth-check
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next()
  if (req.path === '/api/login' || req.path === '/api/auth-check') return next()
  requireAuth(req, res, next)
})

app.get('/api/auth-check', (req, res) => {
  if (!APP_PASSWORD) return res.json({ required: false })
  const auth = req.headers['authorization'] || ''
  res.json({ required: true, valid: auth === `Bearer ${SESSION_TOKEN}` })
})

app.post('/api/login', (req, res) => {
  if (!APP_PASSWORD) return res.json({ token: null, required: false })
  const { password } = req.body
  if (password === APP_PASSWORD) {
    res.json({ token: SESSION_TOKEN })
  } else {
    res.status(401).json({ error: 'Incorrect password.' })
  }
})

// ── Draft ─────────────────────────────────────────────────────────────────────

app.get('/api/draft', (_req, res) => res.json(storage.getDraft() ?? {}))

app.post('/api/draft', (req, res) => {
  const { date, notes } = req.body
  if (typeof date !== 'string' || typeof notes !== 'string')
    return res.status(400).json({ error: 'Invalid payload.' })
  storage.saveDraft({ date, notes })
  res.json({ ok: true })
})

app.delete('/api/draft', (_req, res) => { storage.clearDraft(); res.json({ ok: true }) })

// ── History ───────────────────────────────────────────────────────────────────

app.get('/api/history', (_req, res) => res.json(storage.getHistory()))

app.delete('/api/history/:index', (req, res) => {
  const index = parseInt(req.params.index, 10)
  const history = storage.getHistory()
  if (isNaN(index) || index < 0 || index >= history.length)
    return res.status(400).json({ error: 'Invalid index.' })
  history.splice(index, 1)
  storage.saveHistory(history)
  res.json({ ok: true })
})

// ── Submit ────────────────────────────────────────────────────────────────────

app.post('/api/submit', async (req, res) => {
  const { date, notes } = req.body
  if (!notes?.trim()) return res.status(400).json({ error: 'Notes cannot be empty.' })
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID)
    return res.status(500).json({ error: 'Telegram credentials missing. Check your .env file.' })

  try {
    await sendToTelegram(date, notes)
    storage.addHistory({ date, notes, submittedAt: new Date().toISOString() })
    storage.clearDraft()
    res.json({ ok: true })
  } catch (err) {
    console.error('[Telegram]', err.message)
    res.status(500).json({ error: err.message || 'Failed to send to Telegram.' })
  }
})

// ── Settings ──────────────────────────────────────────────────────────────────

app.get('/api/settings', (_req, res) => res.json(storage.getSettings()))

app.post('/api/settings', (req, res) => {
  const { autoSendEnabled, autoSendTime } = req.body
  if (typeof autoSendEnabled !== 'boolean' || typeof autoSendTime !== 'string')
    return res.status(400).json({ error: 'Invalid payload.' })
  storage.saveSettings({ autoSendEnabled, autoSendTime })
  scheduleAutoSend()
  res.json({ ok: true })
})

// ── Static ────────────────────────────────────────────────────────────────────

// Serve compiled frontend in all modes except Vite dev
if (process.env.NODE_ENV !== 'development') {
  const dist = join(__dirname, '..', 'dist')
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')))
}

// ── Start ─────────────────────────────────────────────────────────────────────

export function startServer(port = PORT) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`✓ EOD server → http://localhost:${port}`)
      if (!process.env.TELEGRAM_BOT_TOKEN) console.warn('⚠  TELEGRAM_BOT_TOKEN not set.')
      if (APP_PASSWORD) console.log('✓ Login enabled.')
      scheduleAutoSend()
      resolve(port)
    })
    server.on('error', reject)
  })
}

// Auto-start when run directly via `node server/server.js`
const isMain = process.argv[1] &&
  (process.argv[1] === __filename || process.argv[1] === __filename.replace(/\\/g, '/'))
if (isMain) startServer()
