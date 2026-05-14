'use strict'

const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron')
const path  = require('path')
const fs    = require('fs')
const https = require('https')
const http  = require('http')
const cron  = require('node-cron')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

// ─── Storage ──────────────────────────────────────────────────────────────────

// Set after app is ready so we can use app.getPath('userData')
let DATA_DIR = path.join(__dirname, '..', 'data')

const draftPath    = () => path.join(DATA_DIR, 'draft.json')
const historyPath  = () => path.join(DATA_DIR, 'history.json')
const settingsPath = () => path.join(DATA_DIR, 'settings.json')

function readJSON(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch { return fallback }
}

function writeJSON(filePath, data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}

const getDraft     = ()  => readJSON(draftPath(), null)
const saveDraft    = (d) => writeJSON(draftPath(), d)
const clearDraft   = ()  => { try { fs.unlinkSync(draftPath()) } catch {} }
const getHistory   = ()  => readJSON(historyPath(), [])
const saveHistory  = (h) => writeJSON(historyPath(), h)
const getSettings  = ()  => readJSON(settingsPath(), { autoSendEnabled: false, autoSendTime: '17:00' })
const saveSettings = (s) => writeJSON(settingsPath(), s)

function addHistory(entry) {
  const h = getHistory()
  h.push(entry)
  writeJSON(historyPath(), h)
}

// ─── Telegram ─────────────────────────────────────────────────────────────────

function buildMessage(date, notes) {
  const [year, month, day] = date.split('-').map(Number)
  const dateStr = new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
  return `<b><u>EOD Summary - ${dateStr}</u></b>\n\n${notes.trim()}`
}

function attemptSend(date, notes) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      chat_id:    process.env.TELEGRAM_CHAT_ID,
      text:       buildMessage(date, notes),
      parse_mode: 'HTML',
    })
    const req = https.request({
      hostname: 'api.telegram.org',
      path:     `/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let raw = ''
      res.on('data', chunk => { raw += chunk })
      res.on('end', () => {
        let parsed
        try { parsed = JSON.parse(raw) } catch { return reject(new Error('Unreadable Telegram response')) }
        parsed.ok ? resolve() : reject(new Error(parsed.description || 'Telegram API error'))
      })
    })
    req.on('error', err => reject(new Error(`Network error: ${err.message}`)))
    req.write(body)
    req.end()
  })
}

async function sendToTelegram(date, notes) {
  let lastErr
  for (let i = 1; i <= 3; i++) {
    try { return await attemptSend(date, notes) } catch (err) {
      lastErr = err
      if (!err.message.startsWith('Network error')) throw err
      if (i < 3) await new Promise(r => setTimeout(r, i * 1000))
    }
  }
  throw lastErr
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

let cronTask = null

function scheduleAutoSend() {
  if (cronTask) { cronTask.stop(); cronTask = null }
  const { autoSendEnabled, autoSendTime } = getSettings()
  if (!autoSendEnabled || !autoSendTime) return
  const [hour, minute] = autoSendTime.split(':').map(Number)
  if (isNaN(hour) || isNaN(minute)) return

  cronTask = cron.schedule(`${minute} ${hour} * * 1-5`, async () => {
    const draft = getDraft()
    if (!draft?.notes?.trim()) return
    if (getHistory().some(e => e.date === draft.date)) return
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return
    try {
      await sendToTelegram(draft.date, draft.notes)
      addHistory({ date: draft.date, notes: draft.notes, submittedAt: new Date().toISOString(), auto: true })
      clearDraft()
    } catch (err) {
      console.error('[Scheduler]', err.message)
    }
  })
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

const APP_PASSWORD = process.env.APP_PASSWORD || ''
let isAuthenticated = !APP_PASSWORD

function requireAuth() {
  if (APP_PASSWORD && !isAuthenticated) throw new Error('Unauthorized')
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('check-auth', () => ({ required: !!APP_PASSWORD, valid: isAuthenticated }))

ipcMain.handle('login', (_, password) => {
  if (password === APP_PASSWORD) { isAuthenticated = true; return { ok: true } }
  return { ok: false, error: 'Incorrect password.' }
})

ipcMain.handle('get-draft', () => { requireAuth(); return getDraft() ?? {} })

ipcMain.handle('save-draft', (_, data) => {
  requireAuth()
  const { date, notes, notesTabs, activeNoteId, checklist } = data
  if (typeof date !== 'string' || typeof notes !== 'string') throw new Error('Invalid data')
  saveDraft({
    date,
    notes,
    notesTabs:    Array.isArray(notesTabs)            ? notesTabs    : [],
    activeNoteId: typeof activeNoteId === 'string'    ? activeNoteId : null,
    checklist:    Array.isArray(checklist)            ? checklist    : [],
  })
  return { ok: true }
})

ipcMain.handle('clear-draft', () => { requireAuth(); clearDraft(); return { ok: true } })

ipcMain.handle('get-history', () => { requireAuth(); return getHistory() })

ipcMain.handle('delete-history', (_, index) => {
  requireAuth()
  const history = getHistory()
  if (index < 0 || index >= history.length) throw new Error('Invalid index')
  history.splice(index, 1)
  saveHistory(history)
  return { ok: true }
})

ipcMain.handle('submit', async (_, date, notes) => {
  requireAuth()
  if (!notes?.trim()) throw new Error('Notes cannot be empty.')
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID)
    throw new Error('Telegram credentials missing. Check your .env file.')
  if (getHistory().some(e => e.date === date))
    throw new Error(`Already submitted EOD for ${date}. Use "Clear for next day" to start fresh.`)
  await sendToTelegram(date, notes)
  addHistory({ date, notes, submittedAt: new Date().toISOString() })
  clearDraft()
  return { ok: true }
})

ipcMain.handle('get-settings', () => { requireAuth(); return getSettings() })

ipcMain.handle('save-settings', (_, { autoSendEnabled, autoSendTime }) => {
  requireAuth()
  if (typeof autoSendEnabled !== 'boolean' || typeof autoSendTime !== 'string')
    throw new Error('Invalid settings')
  saveSettings({ autoSendEnabled, autoSendTime })
  scheduleAutoSend()
  return { ok: true }
})

// ─── Window ───────────────────────────────────────────────────────────────────

let mainWindow = null

function _createWindow() {
  const win = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 360,
    minHeight: 500,
    title: 'EOD Summary',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
    show: false,
  })

  win.webContents.on('context-menu', (_event, params) => {
    if (!params.misspelledWord) return
    const suggestions = params.dictionarySuggestions
    Menu.buildFromTemplate([
      ...suggestions.map(word => ({
        label: word,
        click: () => win.webContents.replaceMisspelling(word),
      })),
      ...(suggestions.length ? [{ type: 'separator' }] : []),
      {
        label: `Add "${params.misspelledWord}" to dictionary`,
        click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      },
    ]).popup()
  })

  win.once('ready-to-show', () => { win.show(); win.focus() })
  win.webContents.setWindowOpenHandler(({ url: u }) => { shell.openExternal(u); return { action: 'deny' } })
  win.on('closed', () => { mainWindow = null })
  return win
}

// ─── Dev: wait for Vite ───────────────────────────────────────────────────────

function waitForVite(port = 5173, maxMs = 15000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxMs
    function attempt() {
      const req = http.get(`http://localhost:${port}`, res => { res.resume(); resolve() })
      req.on('error', () => {
        if (Date.now() >= deadline) return reject(new Error('Vite did not start in time'))
        setTimeout(attempt, 200)
      })
      req.end()
    }
    attempt()
  })
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  DATA_DIR = process.env.EOD_DATA_DIR || app.getPath('userData')
  scheduleAutoSend()

  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    await waitForVite()
    mainWindow = _createWindow()
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow = _createWindow()
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = _createWindow()
      if (process.env.NODE_ENV === 'development') mainWindow.loadURL('http://localhost:5173')
      else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
