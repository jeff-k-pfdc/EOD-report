'use strict'

/**
 * electron/main.cjs — Electron main process
 *
 * Responsibilities:
 *   1. Load .env from the project root
 *   2. Start the Express backend (which serves the built React frontend + API)
 *   3. Open a BrowserWindow pointing at http://localhost:PORT
 *
 * Uses CommonJS (.cjs) so Electron can load it without ESM complications,
 * then dynamically imports the ESM server module at runtime.
 */

const { app, BrowserWindow, shell, Menu } = require('electron')
const path  = require('path')
const http  = require('http')
const dotenv = require('dotenv')

// Load .env from the project root (one level up from electron/)
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const PORT = parseInt(process.env.PORT || '3690', 10)

let mainWindow = null

// ── Window ───────────────────────────────────────────────────────────────────

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 360,
    minHeight: 500,
    title: 'EOD Summary',
    webPreferences: {
      nodeIntegration: false,   // never expose Node.js to the renderer
      contextIsolation: true,
      spellcheck: true,
    },
    show: false, // show only after content has loaded (avoids flash)
  })

  mainWindow.loadURL(url)

  // Spell-check context menu: show suggestions on right-click over misspelled words
  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (!params.misspelledWord) return
    const suggestions = params.dictionarySuggestions
    const menu = Menu.buildFromTemplate([
      ...suggestions.map(word => ({
        label: word,
        click: () => mainWindow.webContents.replaceMisspelling(word),
      })),
      ...(suggestions.length ? [{ type: 'separator' }] : []),
      {
        label: `Add "${params.misspelledWord}" to dictionary`,
        click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      },
    ])
    menu.popup()
  })

  // Reveal the window once it is ready to paint
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  // Open any <a target="_blank"> links in the system browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url: linkUrl }) => {
    shell.openExternal(linkUrl)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ── Server readiness poll ────────────────────────────────────────────────────

/**
 * Poll localhost:port until it responds (or we give up after maxAttempts).
 * This gives the Express server time to bind before we navigate to it.
 */
function waitForServer(port, maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0

    function tryConnect() {
      const req = http.get(`http://localhost:${port}/api/draft`, (res) => {
        res.resume() // drain the response
        resolve()
      })
      req.on('error', () => {
        attempts++
        if (attempts >= maxAttempts) {
          reject(new Error(`Server on port ${port} did not start after ${maxAttempts} attempts.`))
        } else {
          setTimeout(tryConnect, 200)
        }
      })
      req.end()
    }

    tryConnect()
  })
}

// ── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  try {
    // Dynamically import the ESM Express server and start it
    const { startServer } = await import('../server/server.js')
    await startServer(PORT)

    // Wait until the server is actually accepting connections
    await waitForServer(PORT)

    createWindow(`http://localhost:${PORT}`)
  } catch (err) {
    console.error('Failed to start EOD server:', err)
    app.quit()
  }
})

// Quit when all windows are closed (Windows / Linux behaviour)
app.on('window-all-closed', () => {
  app.quit()
})
