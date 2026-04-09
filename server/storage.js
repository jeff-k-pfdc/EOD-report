import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR  = process.env.EOD_DATA_DIR || join(__dirname, '..', 'data')

const DRAFT_FILE    = join(DATA_DIR, 'draft.json')
const HISTORY_FILE  = join(DATA_DIR, 'history.json')
const SETTINGS_FILE = join(DATA_DIR, 'settings.json')

function readJSON(filePath, fallback) {
  try { return JSON.parse(readFileSync(filePath, 'utf8')) } catch { return fallback }
}

function writeJSON(filePath, data) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}

// Draft
export const getDraft     = () => readJSON(DRAFT_FILE, null)
export const saveDraft    = (d) => writeJSON(DRAFT_FILE, d)
export const clearDraft   = () => { try { unlinkSync(DRAFT_FILE) } catch {} }

// History
export const getHistory   = () => readJSON(HISTORY_FILE, [])
export const saveHistory  = (h) => writeJSON(HISTORY_FILE, h)
export function addHistory(entry) {
  const h = getHistory()
  h.push(entry)
  writeJSON(HISTORY_FILE, h)
}

// Settings
export const getSettings  = () => readJSON(SETTINGS_FILE, { autoSendEnabled: false, autoSendTime: '17:00' })
export const saveSettings = (s) => writeJSON(SETTINGS_FILE, s)
