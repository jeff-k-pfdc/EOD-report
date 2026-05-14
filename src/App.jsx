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

// ─── Formatting toolbar ───────────────────────────────────────────────────────

const FORMATS = [
  { label: 'B',       title: 'Bold',          tag: 'b',           style: { fontWeight: 'bold' } },
  { label: 'I',       title: 'Italic',        tag: 'i',           style: { fontStyle: 'italic' } },
  { label: 'U',       title: 'Underline',     tag: 'u',           style: { textDecoration: 'underline' } },
  { label: 'S',       title: 'Strikethrough', tag: 's',           style: { textDecoration: 'line-through' } },
  { label: 'code',    title: 'Inline code',   tag: 'code',        style: { fontFamily: 'monospace' } },
  { label: 'pre',     title: 'Code block',    tag: 'pre',         style: { fontFamily: 'monospace' } },
  { label: '||',      title: 'Spoiler',       tag: 'tg-spoiler',  style: {} },
  { label: '❝',       title: 'Blockquote',    tag: 'blockquote',  style: {} },
]

function FormatToolbar({ textareaRef, value, onChange }) {
  function applyFormat(tag) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end   = el.selectionEnd
    const selected = value.slice(start, end)
    const open  = `<${tag}>`
    const close = `</${tag}>`
    if (value.slice(start - open.length, start) === open &&
        value.slice(end, end + close.length) === close) {
      const next = value.slice(0, start - open.length) + selected + value.slice(end + close.length)
      onChange(next)
      setTimeout(() => { el.selectionStart = start - open.length; el.selectionEnd = end - open.length }, 0)
      return
    }
    const next = value.slice(0, start) + open + selected + close + value.slice(end)
    onChange(next)
    setTimeout(() => {
      el.selectionStart = start + open.length
      el.selectionEnd   = end   + open.length
    }, 0)
  }

  return (
    <div className="format-toolbar">
      {FORMATS.map(({ label, title, tag, style }) => (
        <button
          key={tag}
          type="button"
          className="fmt-btn"
          title={title}
          style={style}
          onMouseDown={e => { e.preventDefault(); applyFormat(tag) }}
        >{label}</button>
      ))}
    </div>
  )
}

// Authenticated fetch — reads token from sessionStorage on every call
function apiFetch(url, opts = {}) {
  const token = sessionStorage.getItem('eod_token') || ''
  const headers = { ...(opts.headers || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(url, { ...opts, headers })
}

// ─── Login screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onAuthenticated }) {
  const [password, setPassword]   = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res  = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (res.ok) {
        if (data.token) sessionStorage.setItem('eod_token', data.token)
        onAuthenticated()
      } else {
        setError(data.error || 'Incorrect password.')
      }
    } catch {
      setError('Could not connect to server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>EOD Summary</h1>
        <div className="field">
          <label htmlFor="lp">Password</label>
          <input
            type="password"
            id="lp"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
          />
        </div>
        {error && <p className="login-error">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  // ── Auth state ───────────────────────────────────────────────────────────────
  const [authState, setAuthState] = useState('checking')

  useEffect(() => {
    const stored = sessionStorage.getItem('eod_token') || ''
    const headers = stored ? { Authorization: `Bearer ${stored}` } : {}
    fetch('/api/auth-check', { headers })
      .then(r => r.json())
      .then(d => {
        if (!d.required || d.valid) {
          setAuthState('authenticated')
        } else {
          sessionStorage.removeItem('eod_token')
          setAuthState('required')
        }
      })
      .catch(() => setAuthState('authenticated'))
  }, [])

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const eodTextareaRef = useRef(null)
  const checklistRef   = useRef([])

  // ── Active tab ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('eod') // 'eod' | 'notes' | 'checklist'

  // ── EOD preview state ────────────────────────────────────────────────────────
  const [previewMode, setPreviewMode] = useState(false)

  // ── EOD state ────────────────────────────────────────────────────────────────
  const [date, setDate]               = useState(todayString())
  const [eodNotes, setEodNotes]       = useState('')
  const [status, setStatus]           = useState(null)
  const [submitting, setSubmitting]   = useState(false)
  const [lastSaved, setLastSaved]     = useState(null)
  const [justSubmitted, setJustSubmitted] = useState(false)
  const [pendingDayChange, setPendingDayChange] = useState(null)

  // ── Notes scratchpad state ───────────────────────────────────────────────────
  const [personalNotes, setPersonalNotes] = useState('')

  // ── Checklist state ──────────────────────────────────────────────────────────
  const [checklist, setChecklist]         = useState([])
  const [newItem, setNewItem]             = useState('')
  const [justAddedToEod, setJustAddedToEod] = useState(new Set())

  // Keep checklistRef in sync so saveDraft always uses the latest list
  useEffect(() => { checklistRef.current = checklist }, [checklist])

  // ── History state ────────────────────────────────────────────────────────────
  const [history, setHistory]         = useState([])
  const [showHistory, setShowHistory] = useState(false)

  // ── Auto-send settings state ─────────────────────────────────────────────────
  const [autoEnabled, setAutoEnabled] = useState(false)
  const [autoTime, setAutoTime]       = useState('17:00')
  const [settingsSaved, setSettingsSaved] = useState(false)

  // ── Load draft, history, and settings once authenticated ─────────────────────
  useEffect(() => {
    if (authState !== 'authenticated') return

    apiFetch('/api/draft')
      .then(r => r.json())
      .then(d => {
        if (d.date) setDate(d.date)
        if (d.notes) setEodNotes(d.notes)
        if (d.personalNotes) setPersonalNotes(d.personalNotes)
        if (Array.isArray(d.checklist)) {
          setChecklist(d.checklist)
          checklistRef.current = d.checklist
        }
      })
      .catch(() => {})

    apiFetch('/api/history')
      .then(r => r.json()).then(setHistory).catch(() => {})

    apiFetch('/api/settings')
      .then(r => r.json())
      .then(s => { setAutoEnabled(s.autoSendEnabled); setAutoTime(s.autoSendTime) })
      .catch(() => {})
  }, [authState])

  // ── Wake / new-day detection via visibility change ───────────────────────────
  useEffect(() => {
    const lastDate = { current: todayString() }
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      const today = todayString()
      if (today !== lastDate.current) {
        setPendingDayChange(today)
        lastDate.current = today
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // ── Auto-save draft ──────────────────────────────────────────────────────────
  const saveDraft = useCallback(async (d, n, pn) => {
    try {
      await apiFetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: d, notes: n, personalNotes: pn, checklist: checklistRef.current }),
      })
      setLastSaved(new Date())
    } catch {}
  }, [])

  const debouncedSave = useDebounced(saveDraft, 1000)

  const handleDateChange      = e => { setDate(e.target.value);         debouncedSave(e.target.value, eodNotes, personalNotes) }
  const handleEodNotesChange  = e => { setEodNotes(e.target.value);     debouncedSave(date, e.target.value, personalNotes) }
  const handlePersonalNotesChange = e => { setPersonalNotes(e.target.value); debouncedSave(date, eodNotes, e.target.value) }

  const handleEodNotesKeyDown = e => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const el    = e.target
    const start = el.selectionStart
    const end   = el.selectionEnd
    const next  = eodNotes.slice(0, start) + '  ' + eodNotes.slice(end)
    setEodNotes(next)
    debouncedSave(date, next, personalNotes)
    setTimeout(() => { el.selectionStart = el.selectionEnd = start + 2 }, 0)
  }

  // ── Checklist handlers ───────────────────────────────────────────────────────
  const addChecklistItem = () => {
    if (!newItem.trim()) return
    const item = { id: Date.now().toString(), text: newItem.trim(), checked: false, detail: '' }
    const next = [...checklist, item]
    checklistRef.current = next
    setChecklist(next)
    setNewItem('')
    debouncedSave(date, eodNotes, personalNotes)
  }

  const toggleChecklistItem = (id) => {
    const next = checklist.map(item => item.id === id ? { ...item, checked: !item.checked } : item)
    checklistRef.current = next
    setChecklist(next)
    debouncedSave(date, eodNotes, personalNotes)
  }

  const deleteChecklistItem = (id) => {
    const next = checklist.filter(item => item.id !== id)
    checklistRef.current = next
    setChecklist(next)
    debouncedSave(date, eodNotes, personalNotes)
  }

  const updateChecklistItemText = (id, text) => {
    const next = checklist.map(item => item.id === id ? { ...item, text } : item)
    checklistRef.current = next
    setChecklist(next)
    debouncedSave(date, eodNotes, personalNotes)
  }

  const updateChecklistItemDetail = (id, detail) => {
    const next = checklist.map(item => item.id === id ? { ...item, detail } : item)
    checklistRef.current = next
    setChecklist(next)
    debouncedSave(date, eodNotes, personalNotes)
  }

  const addToEod = (item) => {
    const detail = (item.detail || '').trim()
    const entry = detail ? `- ${item.text}\n  ${detail}` : `- ${item.text}`
    const newNotes = eodNotes.trim() ? eodNotes + '\n' + entry : entry
    setEodNotes(newNotes)
    debouncedSave(date, newNotes, personalNotes)
    setJustAddedToEod(prev => new Set([...prev, item.id]))
    setTimeout(() => {
      setJustAddedToEod(prev => { const next = new Set(prev); next.delete(item.id); return next })
    }, 2500)
  }

  // ── Copy to clipboard ────────────────────────────────────────────────────────
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`EOD Summary - ${formatDateDisplay(date)}\n\n${eodNotes}`)
      setStatus({ type: 'info', message: 'Copied to clipboard.' })
      setTimeout(() => setStatus(null), 2000)
    } catch {
      setStatus({ type: 'error', message: 'Could not copy to clipboard.' })
    }
  }

  // ── Submit EOD ───────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!eodNotes.trim()) {
      setStatus({ type: 'error', message: 'Please write something before submitting.' })
      return
    }
    setSubmitting(true)
    setStatus(null)
    try {
      const res  = await apiFetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, notes: eodNotes }),
      })
      const data = await res.json()
      if (res.ok) {
        setStatus({ type: 'success', message: 'EOD sent to Telegram successfully.' })
        setJustSubmitted(true)
        apiFetch('/api/history').then(r => r.json()).then(setHistory).catch(() => {})
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
    setEodNotes('')
    setDate(todayString())
    setChecklist([])
    checklistRef.current = []
    setStatus(null)
    setJustSubmitted(false)
    await apiFetch('/api/draft', { method: 'DELETE' }).catch(() => {})
  }

  // ── Accept new day from wake banner ─────────────────────────────────────────
  const handleAcceptNewDay = () => {
    if (!pendingDayChange) return
    setDate(pendingDayChange)
    debouncedSave(pendingDayChange, eodNotes, personalNotes)
    setPendingDayChange(null)
  }

  // ── Delete a history entry ───────────────────────────────────────────────────
  const handleDeleteHistory = async (displayIndex) => {
    const realIndex = history.length - 1 - displayIndex
    try {
      const res = await apiFetch(`/api/history/${realIndex}`, { method: 'DELETE' })
      if (res.ok) setHistory(h => h.filter((_, i) => i !== realIndex))
    } catch {}
  }

  // ── Save auto-send settings ──────────────────────────────────────────────────
  const handleSaveSettings = async () => {
    try {
      await apiFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoSendEnabled: autoEnabled, autoSendTime: autoTime }),
      })
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 2500)
    } catch {}
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (authState === 'checking') {
    return <div className="auth-loading">Loading…</div>
  }

  if (authState === 'required') {
    return <LoginScreen onAuthenticated={() => setAuthState('authenticated')} />
  }

  const pendingItems = checklist.filter(i => !i.checked).length

  return (
    <div className="app">
      <header className="app-header">
        <h1>EOD Summary</h1>
        {lastSaved && (
          <span className="autosave-pill">Saved {lastSaved.toLocaleTimeString()}</span>
        )}
      </header>

      <main className="app-main">

        {/* ── New-day wake banner ────────────────────────────────────────────── */}
        {pendingDayChange && (
          <div className="new-day-banner">
            <span className="new-day-text">
              New day: <strong>{formatDateDisplay(pendingDayChange)}</strong>
            </span>
            <button className="btn btn-primary btn-sm" onClick={handleAcceptNewDay}>
              Update date
            </button>
            <button className="btn-dismiss" onClick={() => setPendingDayChange(null)} title="Dismiss">✕</button>
          </div>
        )}

        {/* ── Top-level tabs ────────────────────────────────────────────────── */}
        <div className="section-tabs">
          <button
            type="button"
            className={`section-tab${activeTab === 'eod' ? ' active' : ''}`}
            onClick={() => setActiveTab('eod')}
          >EOD</button>
          <button
            type="button"
            className={`section-tab${activeTab === 'notes' ? ' active' : ''}`}
            onClick={() => setActiveTab('notes')}
          >Notes</button>
          <button
            type="button"
            className={`section-tab${activeTab === 'checklist' ? ' active' : ''}`}
            onClick={() => setActiveTab('checklist')}
          >
            Checklist
            {pendingItems > 0 && (
              <span className="tab-badge">{pendingItems}</span>
            )}
          </button>
        </div>

        {/* ══ EOD tab ══════════════════════════════════════════════════════════ */}
        {activeTab === 'eod' && (
          <>
            {/* Date field */}
            <div className="field field-date">
              <label htmlFor="date">Date</label>
              <input type="date" id="date" value={date} onChange={handleDateChange} />
            </div>

            {/* Auto-send row */}
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

            {autoEnabled && (
              <p className="autosend-hint">
                Will auto-send at {formatTime12h(autoTime)} on weekdays. App must be running.
              </p>
            )}

            {/* EOD notes editor */}
            <div className="field">
              <div className="notes-header">
                <label htmlFor="eod-notes">Report</label>
                <div className="preview-tabs">
                  <button
                    type="button"
                    className={`preview-tab${!previewMode ? ' active' : ''}`}
                    onClick={() => setPreviewMode(false)}
                  >Write</button>
                  <button
                    type="button"
                    className={`preview-tab${previewMode ? ' active' : ''}`}
                    onClick={() => setPreviewMode(true)}
                  >Preview</button>
                </div>
              </div>
              <FormatToolbar
                textareaRef={eodTextareaRef}
                value={eodNotes}
                onChange={v => { setEodNotes(v); debouncedSave(date, v, personalNotes) }}
              />
              {previewMode ? (
                <div
                  className="tg-preview"
                  dangerouslySetInnerHTML={{ __html: eodNotes.trim()
                    ? `<span class="tg-preview-header"><b><u>EOD Summary - ${formatDateDisplay(date)}</u></b></span>\n\n${eodNotes}`
                    : '<span class="tg-preview-empty">Nothing to preview yet…</span>'
                  }}
                />
              ) : (
                <textarea
                  id="eod-notes"
                  ref={eodTextareaRef}
                  value={eodNotes}
                  onChange={handleEodNotesChange}
                  onKeyDown={handleEodNotesKeyDown}
                  placeholder="Write your end-of-day report here…"
                  rows={13}
                  spellCheck={true}
                />
              )}
            </div>

            {/* Status */}
            {status && (
              <div className={`status-bar status-${status.type}`} role="alert">
                <span className="status-icon">
                  {status.type === 'success' ? '✓' : status.type === 'error' ? '✕' : 'i'}
                </span>
                {status.message}
              </div>
            )}

            {/* Actions */}
            <div className="actions">
              <button className="btn btn-ghost" onClick={handleCopy}>Copy</button>
              {justSubmitted && (
                <button className="btn btn-outline" onClick={handleClear}>Clear for next day</button>
              )}
              {status?.type === 'error' && !justSubmitted && (
                <button className="btn btn-outline" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? 'Retrying…' : 'Retry'}
                </button>
              )}
              <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Sending…' : 'Submit EOD'}
              </button>
            </div>

            {/* History */}
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
          </>
        )}

        {/* ══ Notes tab ════════════════════════════════════════════════════════ */}
        {activeTab === 'notes' && (
          <div className="field">
            <label htmlFor="personal-notes">Notes</label>
            <textarea
              id="personal-notes"
              value={personalNotes}
              onChange={handlePersonalNotesChange}
              placeholder="Write anything here — this is your personal scratchpad and is never submitted."
              rows={18}
              spellCheck={true}
            />
          </div>
        )}

        {/* ══ Checklist tab ════════════════════════════════════════════════════ */}
        {activeTab === 'checklist' && (
          <div className="checklist-section">
            <div className="checklist-add">
              <input
                type="text"
                className="checklist-input"
                placeholder="Add a task…"
                value={newItem}
                onChange={e => setNewItem(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem() } }}
                autoFocus
              />
              <button className="btn btn-primary btn-sm" onClick={addChecklistItem}>Add</button>
            </div>
            {checklist.length === 0 ? (
              <p className="checklist-empty">No tasks yet. Type above and press Enter or click Add.</p>
            ) : (
              <ul className="checklist-items">
                {checklist.map(item => (
                  <li key={item.id} className={`checklist-item${item.checked ? ' checked' : ''}`}>
                    <div className="checklist-item-row">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => toggleChecklistItem(item.id)}
                        className="checklist-checkbox"
                      />
                      <input
                        type="text"
                        className="checklist-item-text"
                        value={item.text}
                        onChange={e => updateChecklistItemText(item.id, e.target.value)}
                      />
                      <button
                        className="btn-delete"
                        onClick={() => deleteChecklistItem(item.id)}
                        title="Delete"
                      >✕</button>
                    </div>
                    {item.checked && (
                      <div className="checklist-detail-area">
                        <textarea
                          className="checklist-detail-input"
                          placeholder="Add detail (optional)…"
                          value={item.detail || ''}
                          onChange={e => updateChecklistItemDetail(item.id, e.target.value)}
                          rows={2}
                          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addToEod(item) } }}
                        />
                        <button
                          className={`btn btn-sm ${justAddedToEod.has(item.id) ? 'btn-ghost' : 'btn-outline'}`}
                          onClick={() => addToEod(item)}
                        >
                          {justAddedToEod.has(item.id) ? 'Added to EOD ✓' : 'Add to EOD'}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

      </main>
    </div>
  )
}
