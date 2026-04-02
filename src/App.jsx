import { useState, useEffect, useCallback, useRef } from 'react'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayString() {
  return new Date().toISOString().split('T')[0]
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

// Formats "17:00" → "5:00 PM"
function formatTime12h(timeStr) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour   = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

function useDebounced(fn, delay) {
  const timer = useRef(null)
  return useCallback((...args) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => fn(...args), delay)
  }, [fn, delay])
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  // ── Editor state ────────────────────────────────────────────────────────────
  const [date, setDate]               = useState(todayString())
  const [notes, setNotes]             = useState('')
  const [status, setStatus]           = useState(null)
  const [submitting, setSubmitting]   = useState(false)
  const [lastSaved, setLastSaved]     = useState(null)
  const [justSubmitted, setJustSubmitted] = useState(false)

  // ── History state ────────────────────────────────────────────────────────────
  const [history, setHistory]         = useState([])
  const [showHistory, setShowHistory] = useState(false)

  // ── Auto-send settings state ─────────────────────────────────────────────────
  const [autoEnabled, setAutoEnabled] = useState(false)
  const [autoTime, setAutoTime]       = useState('17:00')
  const [settingsSaved, setSettingsSaved] = useState(false)

  // ── Load draft, history, and settings on mount ───────────────────────────────
  useEffect(() => {
    fetch('/api/draft')
      .then(r => r.json())
      .then(d => { if (d.date) setDate(d.date); if (d.notes) setNotes(d.notes) })
      .catch(() => {})

    fetch('/api/history')
      .then(r => r.json()).then(setHistory).catch(() => {})

    fetch('/api/settings')
      .then(r => r.json())
      .then(s => { setAutoEnabled(s.autoSendEnabled); setAutoTime(s.autoSendTime) })
      .catch(() => {})
  }, [])

  // ── Auto-save draft ──────────────────────────────────────────────────────────
  const saveDraft = useCallback(async (d, n) => {
    try {
      await fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: d, notes: n }),
      })
      setLastSaved(new Date())
    } catch {}
  }, [])

  const debouncedSave = useDebounced(saveDraft, 1000)

  const handleDateChange = e => { setDate(e.target.value); debouncedSave(e.target.value, notes) }
  const handleNotesChange = e => { setNotes(e.target.value); debouncedSave(date, e.target.value) }

  // ── Copy to clipboard ────────────────────────────────────────────────────────
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`EOD Summary - ${formatDateDisplay(date)}\n\n${notes}`)
      setStatus({ type: 'info', message: 'Copied to clipboard.' })
      setTimeout(() => setStatus(null), 2000)
    } catch {
      setStatus({ type: 'error', message: 'Could not copy to clipboard.' })
    }
  }

  // ── Submit EOD ───────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!notes.trim()) {
      setStatus({ type: 'error', message: 'Please write something before submitting.' })
      return
    }
    setSubmitting(true)
    setStatus(null)
    try {
      const res  = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, notes }),
      })
      const data = await res.json()
      if (res.ok) {
        setStatus({ type: 'success', message: 'EOD sent to Telegram successfully.' })
        setJustSubmitted(true)
        fetch('/api/history').then(r => r.json()).then(setHistory).catch(() => {})
      } else {
        setStatus({ type: 'error', message: data.error || 'Failed to send. Check your Telegram settings.' })
      }
    } catch {
      setStatus({ type: 'error', message: 'Network error. Is the server running?' })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Clear form ───────────────────────────────────────────────────────────────
  const handleClear = async () => {
    setNotes(''); setDate(todayString()); setStatus(null); setJustSubmitted(false)
    await fetch('/api/draft', { method: 'DELETE' }).catch(() => {})
  }

  // ── Delete a history entry ───────────────────────────────────────────────────
  const handleDeleteHistory = async (displayIndex) => {
    // displayIndex is position in the reversed list; convert to real array index
    const realIndex = history.length - 1 - displayIndex
    try {
      const res = await fetch(`/api/history/${realIndex}`, { method: 'DELETE' })
      if (res.ok) setHistory(h => h.filter((_, i) => i !== realIndex))
    } catch {}
  }

  // ── Save auto-send settings ──────────────────────────────────────────────────
  const handleSaveSettings = async () => {
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoSendEnabled: autoEnabled, autoSendTime: autoTime }),
      })
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 2500)
    } catch {
      // silently ignore
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="app">
      <header className="app-header">
        <h1>EOD Summary</h1>
        {lastSaved && (
          <span className="autosave-pill">Saved {lastSaved.toLocaleTimeString()}</span>
        )}
      </header>

      <main className="app-main">

        {/* ── Date field ────────────────────────────────────────────────────── */}
        <div className="field field-date">
          <label htmlFor="date">Date</label>
          <input type="date" id="date" value={date} onChange={handleDateChange} />
        </div>

        {/* ── Auto-send row (full width, never wraps off screen) ────────────── */}
        <div className="autosend-row">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={autoEnabled}
              onChange={e => setAutoEnabled(e.target.checked)}
            />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
            <span className="toggle-text">Auto-send</span>
          </label>
          <input
            type="time"
            className="time-input"
            value={autoTime}
            onChange={e => setAutoTime(e.target.value)}
            disabled={!autoEnabled}
          />
          <button className="btn btn-ghost btn-sm" onClick={handleSaveSettings}>
            {settingsSaved ? 'Saved ✓' : 'Save'}
          </button>
        </div>

        {/* Auto-send status hint */}
        {autoEnabled && (
          <p className="autosend-hint">
            Will auto-send at {formatTime12h(autoTime)} on weekdays. App must be running.
          </p>
        )}

        {/* ── Notes ────────────────────────────────────────────────────────── */}
        <div className="field">
          <label htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            value={notes}
            onChange={handleNotesChange}
            placeholder="Write your end-of-day notes here…"
            rows={13}
          />
        </div>

        {/* ── Status ───────────────────────────────────────────────────────── */}
        {status && (
          <div className={`status-bar status-${status.type}`} role="alert">
            <span className="status-icon">
              {status.type === 'success' ? '✓' : status.type === 'error' ? '✕' : 'i'}
            </span>
            {status.message}
          </div>
        )}

        {/* ── Actions ──────────────────────────────────────────────────────── */}
        <div className="actions">
          <button className="btn btn-ghost" onClick={handleCopy}>Copy</button>
          {justSubmitted && (
            <button className="btn btn-outline" onClick={handleClear}>Clear for next day</button>
          )}
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Sending…' : 'Submit EOD'}
          </button>
        </div>

        {/* ── History ──────────────────────────────────────────────────────── */}
        <section className="history-section">
          <button
            className="history-toggle"
            onClick={() => setShowHistory(v => !v)}
            aria-expanded={showHistory}
          >
            <span>Previous submissions</span>
            <span className="history-count">{history.length}</span>
            <span className="history-chevron">{showHistory ? '▲' : '▼'}</span>
          </button>

          {showHistory && (
            <div className="history-list">
              {history.length === 0 ? (
                <p className="history-empty">No submissions yet.</p>
              ) : (
                [...history].reverse().map((item, i) => (
                  <div key={i} className="history-item">
                    <div className="history-item-header">
                      <span className="history-item-date">{formatDateDisplay(item.date)}</span>
                      <span className="history-item-meta">
                        {item.auto && <span className="badge-auto">Auto</span>}
                        {new Date(item.submittedAt).toLocaleTimeString()}
                        <button
                          className="btn-delete"
                          onClick={() => handleDeleteHistory(i)}
                          title="Delete this entry"
                        >✕</button>
                      </span>
                    </div>
                    <pre className="history-item-notes">{item.notes}</pre>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

      </main>
    </div>
  )
}
