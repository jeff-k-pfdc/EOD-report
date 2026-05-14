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

function formatDateShort(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatTime12h(timeStr) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour   = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

function useDebounced(fn, delay) {
  const timerRef = useRef(null)
  return useCallback((...args) => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => fn(...args), delay)
  }, [fn, delay])
}

let _noteCounter = 1
function makeNote(name) {
  return { id: `note-${Date.now()}-${_noteCounter++}`, name, content: '' }
}

const _initialNote = makeNote('Note 1')

// ─── EOD format toolbar (Telegram HTML tags) ──────────────────────────────────

const FORMATS = [
  { label: 'B',    title: 'Bold',          tag: 'b',          style: { fontWeight: 'bold' } },
  { label: 'I',    title: 'Italic',        tag: 'i',          style: { fontStyle: 'italic' } },
  { label: 'U',    title: 'Underline',     tag: 'u',          style: { textDecoration: 'underline' } },
  { label: 'S',    title: 'Strikethrough', tag: 's',          style: { textDecoration: 'line-through' } },
  { label: 'code', title: 'Inline code',   tag: 'code',       style: { fontFamily: 'monospace' } },
  { label: 'pre',  title: 'Code block',    tag: 'pre',        style: { fontFamily: 'monospace' } },
  { label: '||',   title: 'Spoiler',       tag: 'tg-spoiler', style: {} },
  { label: '❝',    title: 'Blockquote',    tag: 'blockquote', style: {} },
]

function FormatToolbar({ textareaRef, value, onChange }) {
  function applyFormat(tag) {
    const el = textareaRef.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    const open = `<${tag}>`, close = `</${tag}>`
    const selected = value.slice(s, e)
    if (value.slice(s - open.length, s) === open && value.slice(e, e + close.length) === close) {
      const next = value.slice(0, s - open.length) + selected + value.slice(e + close.length)
      onChange(next)
      setTimeout(() => { el.selectionStart = s - open.length; el.selectionEnd = e - open.length }, 0)
      return
    }
    const next = value.slice(0, s) + open + selected + close + value.slice(e)
    onChange(next)
    setTimeout(() => { el.selectionStart = s + open.length; el.selectionEnd = e + open.length }, 0)
  }

  return (
    <div className="format-toolbar">
      {FORMATS.map(({ label, title, tag, style }) => (
        <button key={tag} type="button" className="fmt-btn" title={title} style={style}
          onMouseDown={ev => { ev.preventDefault(); applyFormat(tag) }}
        >{label}</button>
      ))}
    </div>
  )
}

// ─── Rich text editor (for Notes) ────────────────────────────────────────────

function RichToolbar({ editorRef }) {
  const savedRange = useRef(null)

  const saveRange = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) savedRange.current = sel.getRangeAt(0).cloneRange()
  }

  const restoreRange = () => {
    try {
      const sel = window.getSelection()
      if (savedRange.current && sel) { sel.removeAllRanges(); sel.addRange(savedRange.current) }
    } catch {}
  }

  // Use onMouseDown + preventDefault so the editor keeps focus & selection
  const cmd = (command, value = null) => (e) => {
    e.preventDefault()
    document.execCommand('styleWithCSS', false, true)
    document.execCommand(command, false, value)
    editorRef.current?.focus()
  }

  // For color inputs: save selection on mousedown, restore + apply on change
  const colorCmd = (command) => ({
    onMouseDown: () => saveRange(),
    onChange: (e) => {
      restoreRange()
      document.execCommand('styleWithCSS', false, true)
      document.execCommand(command, false, e.target.value)
      editorRef.current?.focus()
    },
  })

  return (
    <div className="rich-toolbar">
      <button className="rich-btn" title="Bold"          onMouseDown={cmd('bold')}><b>B</b></button>
      <button className="rich-btn" title="Italic"        onMouseDown={cmd('italic')}><i>I</i></button>
      <button className="rich-btn" title="Underline"     onMouseDown={cmd('underline')}><u>U</u></button>
      <button className="rich-btn" title="Strikethrough" onMouseDown={cmd('strikeThrough')}><s>S</s></button>

      <div className="rich-sep" />

      <button className="rich-btn rich-size-xs" title="Small"  onMouseDown={cmd('fontSize', '1')}>A</button>
      <button className="rich-btn rich-size-sm" title="Normal" onMouseDown={cmd('fontSize', '3')}>A</button>
      <button className="rich-btn rich-size-lg" title="Large"  onMouseDown={cmd('fontSize', '5')}>A</button>
      <button className="rich-btn rich-size-xl" title="Huge"   onMouseDown={cmd('fontSize', '7')}>A</button>

      <div className="rich-sep" />

      <label className="rich-color-label" title="Text color">
        <span className="rich-color-icon text-color-icon">A</span>
        <input type="color" defaultValue="#111827" {...colorCmd('foreColor')} />
      </label>

      <label className="rich-color-label" title="Highlight">
        <span className="rich-color-icon highlight-icon">A</span>
        <input type="color" defaultValue="#fef08a" {...colorCmd('hiliteColor')} />
      </label>

      <div className="rich-sep" />

      <button className="rich-btn" title="Clear formatting" onMouseDown={cmd('removeFormat')}>✕<sub>f</sub></button>
    </div>
  )
}

function RichTextEditor({ content, onChange }) {
  const editorRef = useRef(null)

  // Set content on mount (component is re-keyed when note switches)
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = content || ''
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleInput = () => {
    if (editorRef.current) onChange(editorRef.current.innerHTML)
  }

  return (
    <div className="rich-editor-wrap">
      <RichToolbar editorRef={editorRef} />
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        className="rich-editor"
        spellCheck={true}
      />
    </div>
  )
}

// ─── Login screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onAuthenticated }) {
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await window.api.login(password)
      if (result.ok) onAuthenticated()
      else setError(result.error || 'Incorrect password.')
    } catch {
      setError('Could not authenticate.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Management System</h1>
        <div className="field">
          <label htmlFor="lp">Password</label>
          <input type="password" id="lp" value={password}
            onChange={e => setPassword(e.target.value)} autoFocus autoComplete="current-password" />
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
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const [authState, setAuthState] = useState('checking')

  useEffect(() => {
    window.api.checkAuth()
      .then(d => {
        if (!d.required || d.valid) setAuthState('authenticated')
        else setAuthState('required')
      })
      .catch(() => setAuthState('authenticated'))
  }, [])

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const eodTextareaRef  = useRef(null)
  const checklistRef    = useRef([])
  const notesTabsRef    = useRef([_initialNote])
  const activeNoteIdRef = useRef(_initialNote.id)

  // ── Tab navigation ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('eod')

  // ── EOD state ────────────────────────────────────────────────────────────────
  const [previewMode, setPreviewMode]           = useState(false)
  const [date, setDate]                         = useState(todayString())
  const [eodNotes, setEodNotes]                 = useState('')
  const [status, setStatus]                     = useState(null)
  const [submitting, setSubmitting]             = useState(false)
  const [lastSaved, setLastSaved]               = useState(null)
  const [justSubmitted, setJustSubmitted]       = useState(false)
  const [pendingDayChange, setPendingDayChange] = useState(null)
  const [history, setHistory]                   = useState([])
  const [showHistory, setShowHistory]           = useState(false)
  const [autoEnabled, setAutoEnabled]           = useState(false)
  const [autoTime, setAutoTime]                 = useState('17:00')
  const [settingsSaved, setSettingsSaved]       = useState(false)

  // ── Notes state ───────────────────────────────────────────────────────────────
  const [notesTabs, setNotesTabs]             = useState([_initialNote])
  const [activeNoteId, setActiveNoteId]       = useState(_initialNote.id)
  const [editingNoteId, setEditingNoteId]     = useState(null)
  const [editingNoteName, setEditingNoteName] = useState('')

  useEffect(() => { notesTabsRef.current = notesTabs },       [notesTabs])
  useEffect(() => { activeNoteIdRef.current = activeNoteId }, [activeNoteId])

  // ── Checklist state ───────────────────────────────────────────────────────────
  const [checklist, setChecklist]         = useState([])
  const [newItem, setNewItem]             = useState('')
  const [showCompleted, setShowCompleted] = useState(false)
  const [justAddedIds, setJustAddedIds]   = useState([])

  useEffect(() => { checklistRef.current = checklist }, [checklist])

  // ── Load data ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authState !== 'authenticated') return

    window.api.getDraft().then(d => {
      if (d.date)  setDate(d.date)
      if (d.notes) setEodNotes(d.notes)

      if (Array.isArray(d.notesTabs) && d.notesTabs.length > 0) {
        setNotesTabs(d.notesTabs)
        notesTabsRef.current = d.notesTabs
        const id = d.activeNoteId || d.notesTabs[0].id
        setActiveNoteId(id)
        activeNoteIdRef.current = id
      } else if (typeof d.personalNotes === 'string' && d.personalNotes) {
        const migrated = [{ id: 'migrated-1', name: 'Note 1', content: d.personalNotes }]
        setNotesTabs(migrated)
        notesTabsRef.current = migrated
        setActiveNoteId('migrated-1')
        activeNoteIdRef.current = 'migrated-1'
      }

      if (Array.isArray(d.checklist)) {
        setChecklist(d.checklist)
        checklistRef.current = d.checklist
      }
    }).catch(() => {})

    window.api.getHistory().then(setHistory).catch(() => {})
    window.api.getSettings().then(s => {
      setAutoEnabled(s.autoSendEnabled)
      setAutoTime(s.autoSendTime)
    }).catch(() => {})
  }, [authState])

  // ── Wake / new-day detection ──────────────────────────────────────────────────
  useEffect(() => {
    const lastDate = { current: todayString() }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const today = todayString()
      if (today !== lastDate.current) { setPendingDayChange(today); lastDate.current = today }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // ── Auto-save ─────────────────────────────────────────────────────────────────
  const saveDraft = useCallback(async (d, n) => {
    try {
      await window.api.saveDraft({
        date: d, notes: n,
        notesTabs:    notesTabsRef.current,
        activeNoteId: activeNoteIdRef.current,
        checklist:    checklistRef.current,
      })
      setLastSaved(new Date())
    } catch {}
  }, [])

  const debouncedSave = useDebounced(saveDraft, 1000)

  const handleDateChange     = e => { setDate(e.target.value);     debouncedSave(e.target.value, eodNotes) }
  const handleEodNotesChange = e => { setEodNotes(e.target.value); debouncedSave(date, e.target.value) }

  const handleEodNotesKeyDown = e => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const el = e.target, s = el.selectionStart, end = el.selectionEnd
    const next = eodNotes.slice(0, s) + '  ' + eodNotes.slice(end)
    setEodNotes(next)
    debouncedSave(date, next)
    setTimeout(() => { el.selectionStart = el.selectionEnd = s + 2 }, 0)
  }

  // ── Notes tab handlers ────────────────────────────────────────────────────────
  const addNote = () => {
    const note = makeNote(`Note ${notesTabs.length + 1}`)
    const next = [...notesTabs, note]
    notesTabsRef.current = next
    activeNoteIdRef.current = note.id
    setNotesTabs(next)
    setActiveNoteId(note.id)
    debouncedSave(date, eodNotes)
  }

  const deleteNote = (id) => {
    if (notesTabs.length <= 1) return
    const next = notesTabs.filter(n => n.id !== id)
    const newActive = activeNoteId === id ? next[next.length - 1].id : activeNoteId
    notesTabsRef.current = next
    activeNoteIdRef.current = newActive
    setNotesTabs(next)
    setActiveNoteId(newActive)
    debouncedSave(date, eodNotes)
  }

  const updateNoteContent = (id, content) => {
    const next = notesTabs.map(n => n.id === id ? { ...n, content } : n)
    notesTabsRef.current = next
    setNotesTabs(next)
    debouncedSave(date, eodNotes)
  }

  const startRenaming = (id, name) => { setEditingNoteId(id); setEditingNoteName(name) }

  const confirmRename = () => {
    const trimmed = editingNoteName.trim()
    if (trimmed) {
      const next = notesTabs.map(n => n.id === editingNoteId ? { ...n, name: trimmed } : n)
      notesTabsRef.current = next
      setNotesTabs(next)
      debouncedSave(date, eodNotes)
    }
    setEditingNoteId(null)
  }

  const switchNote = (id) => {
    activeNoteIdRef.current = id
    setActiveNoteId(id)
    debouncedSave(date, eodNotes)
  }

  const activeNote = notesTabs.find(n => n.id === activeNoteId) ?? notesTabs[0]

  // ── Checklist handlers ────────────────────────────────────────────────────────
  const addChecklistItem = () => {
    if (!newItem.trim()) return
    const item = { id: `cl-${Date.now()}`, text: newItem.trim(), checked: false, detail: '', completedAt: null }
    const next = [...checklist, item]
    checklistRef.current = next
    setChecklist(next)
    setNewItem('')
    debouncedSave(date, eodNotes)
  }

  const toggleChecklistItem = (id) => {
    const next = checklist.map(item => {
      if (item.id !== id) return item
      const nowChecked = !item.checked
      return { ...item, checked: nowChecked, completedAt: nowChecked ? new Date().toISOString() : null }
    })
    checklistRef.current = next
    setChecklist(next)
    // Auto-open completed section when an item is checked
    if (next.find(i => i.id === id)?.checked) setShowCompleted(true)
    debouncedSave(date, eodNotes)
  }

  const restoreChecklistItem = (id) => {
    const next = checklist.map(item =>
      item.id === id ? { ...item, checked: false, completedAt: null } : item
    )
    checklistRef.current = next
    setChecklist(next)
    debouncedSave(date, eodNotes)
  }

  const deleteChecklistItem = (id) => {
    const next = checklist.filter(item => item.id !== id)
    checklistRef.current = next
    setChecklist(next)
    debouncedSave(date, eodNotes)
  }

  const updateItemText = (id, text) => {
    const next = checklist.map(item => item.id === id ? { ...item, text } : item)
    checklistRef.current = next
    setChecklist(next)
    debouncedSave(date, eodNotes)
  }

  const updateItemDetail = (id, detail) => {
    const next = checklist.map(item => item.id === id ? { ...item, detail } : item)
    checklistRef.current = next
    setChecklist(next)
    debouncedSave(date, eodNotes)
  }

  const addToEod = (item) => {
    const detail = (item.detail || '').trim()
    const entry  = detail ? `- ${item.text}\n  ${detail}` : `- ${item.text}`
    const newNotes = eodNotes.trim() ? eodNotes + '\n' + entry : entry
    setEodNotes(newNotes)
    debouncedSave(date, newNotes)
    setJustAddedIds(prev => [...prev, item.id])
    setTimeout(() => setJustAddedIds(prev => prev.filter(x => x !== item.id)), 2500)
  }

  // ── EOD actions ───────────────────────────────────────────────────────────────
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`EOD Summary - ${formatDateDisplay(date)}\n\n${eodNotes}`)
      setStatus({ type: 'info', message: 'Copied to clipboard.' })
      setTimeout(() => setStatus(null), 2000)
    } catch {
      setStatus({ type: 'error', message: 'Could not copy to clipboard.' })
    }
  }

  const handleSubmit = async () => {
    if (!eodNotes.trim()) {
      setStatus({ type: 'error', message: 'Please write something before submitting.' })
      return
    }
    setSubmitting(true)
    setStatus(null)
    try {
      await window.api.submit(date, eodNotes)
      setStatus({ type: 'success', message: 'EOD sent to Telegram successfully.' })
      setJustSubmitted(true)
      window.api.getHistory().then(setHistory).catch(() => {})
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Failed to send. Check your Telegram settings.' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleClear = async () => {
    setEodNotes('')
    setDate(todayString())
    setChecklist([])
    checklistRef.current = []
    setStatus(null)
    setJustSubmitted(false)
    await window.api.clearDraft().catch(() => {})
  }

  const handleAcceptNewDay = () => {
    if (!pendingDayChange) return
    setDate(pendingDayChange)
    debouncedSave(pendingDayChange, eodNotes)
    setPendingDayChange(null)
  }

  const handleDeleteHistory = async (displayIdx) => {
    const realIdx = history.length - 1 - displayIdx
    try {
      await window.api.deleteHistory(realIdx)
      setHistory(h => h.filter((_, i) => i !== realIdx))
    } catch {}
  }

  const handleSaveSettings = async () => {
    try {
      await window.api.saveSettings({ autoSendEnabled: autoEnabled, autoSendTime: autoTime })
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 2500)
    } catch {}
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (authState === 'checking') return <div className="auth-loading">Loading…</div>
  if (authState === 'required')  return <LoginScreen onAuthenticated={() => setAuthState('authenticated')} />

  const activeItems    = checklist.filter(i => !i.checked)
  const completedItems = checklist.filter(i => i.checked)

  return (
    <div className="app">
      <header className="app-header">
        <h1>Management System</h1>
        {lastSaved && <span className="autosave-pill">Saved {lastSaved.toLocaleTimeString()}</span>}
      </header>

      <main className="app-main">

        {/* ── New-day wake banner ─────────────────────────────────────────── */}
        {pendingDayChange && (
          <div className="new-day-banner">
            <span className="new-day-text">New day: <strong>{formatDateDisplay(pendingDayChange)}</strong></span>
            <button className="btn btn-primary btn-sm" onClick={handleAcceptNewDay}>Update date</button>
            <button className="btn-dismiss" onClick={() => setPendingDayChange(null)} title="Dismiss">✕</button>
          </div>
        )}

        {/* ── Top-level tabs: Checklist | EOD | Notes ─────────────────────── */}
        <div className="section-tabs">
          <button type="button" className={`section-tab${activeTab === 'checklist' ? ' active' : ''}`} onClick={() => setActiveTab('checklist')}>
            Checklist
            {activeItems.length > 0 && <span className="tab-badge">{activeItems.length}</span>}
          </button>
          <button type="button" className={`section-tab${activeTab === 'eod' ? ' active' : ''}`} onClick={() => setActiveTab('eod')}>EOD</button>
          <button type="button" className={`section-tab${activeTab === 'notes' ? ' active' : ''}`} onClick={() => setActiveTab('notes')}>Notes</button>
        </div>

        {/* ══ Checklist tab ════════════════════════════════════════════════ */}
        {activeTab === 'checklist' && (
          <div className="checklist-section">
            {/* Add item */}
            <div className="checklist-add">
              <input
                type="text" className="checklist-input" placeholder="Add a task…"
                value={newItem} onChange={e => setNewItem(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem() } }}
                autoFocus
              />
              <button className="btn btn-primary btn-sm" onClick={addChecklistItem}>Add</button>
            </div>

            {/* Active items */}
            {activeItems.length === 0 && completedItems.length === 0 && (
              <p className="checklist-empty">No tasks yet. Type above and press Enter or click Add.</p>
            )}
            {activeItems.length === 0 && completedItems.length > 0 && (
              <p className="checklist-empty">All done!</p>
            )}

            {activeItems.length > 0 && (
              <ul className="checklist-items">
                {activeItems.map(item => (
                  <li key={item.id} className="checklist-item">
                    <div className="checklist-item-row">
                      <input type="checkbox" className="checklist-checkbox"
                        checked={false} onChange={() => toggleChecklistItem(item.id)} />
                      <input type="text" className="checklist-item-text"
                        value={item.text} onChange={e => updateItemText(item.id, e.target.value)} />
                      <button className="btn-delete" onClick={() => deleteChecklistItem(item.id)} title="Delete">✕</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Completed section */}
            {completedItems.length > 0 && (
              <div className="completed-section">
                <button className="completed-toggle" onClick={() => setShowCompleted(v => !v)}>
                  <span>Completed</span>
                  <span className="history-count">{completedItems.length}</span>
                  <span className="history-chevron">{showCompleted ? '▲' : '▼'}</span>
                </button>

                {showCompleted && (
                  <ul className="completed-items">
                    {completedItems.map(item => (
                      <li key={item.id} className="completed-item">
                        <div className="completed-item-row">
                          <input type="checkbox" className="checklist-checkbox"
                            checked={true} onChange={() => restoreChecklistItem(item.id)}
                            title="Restore to active" />
                          <span className="completed-item-text">{item.text}</span>
                          <span className="completed-item-date">{formatDateShort(item.completedAt)}</span>
                          <button className="btn btn-ghost btn-sm" onClick={() => restoreChecklistItem(item.id)}>Restore</button>
                          <button className="btn-delete" onClick={() => deleteChecklistItem(item.id)} title="Delete">✕</button>
                        </div>
                        <div className="checklist-detail-area">
                          <textarea className="checklist-detail-input" placeholder="Add detail (optional)…"
                            value={item.detail || ''} onChange={e => updateItemDetail(item.id, e.target.value)}
                            rows={2}
                            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addToEod(item) } }}
                          />
                          <button
                            className={`btn btn-sm ${justAddedIds.includes(item.id) ? 'btn-ghost' : 'btn-outline'}`}
                            onClick={() => addToEod(item)}
                          >
                            {justAddedIds.includes(item.id) ? 'Added to EOD ✓' : 'Add to EOD'}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ EOD tab ══════════════════════════════════════════════════════ */}
        {activeTab === 'eod' && (
          <>
            <div className="field field-date">
              <label htmlFor="date">Date</label>
              <input type="date" id="date" value={date} onChange={handleDateChange} />
            </div>

            <div className="autosend-row">
              <label className="toggle-label">
                <input type="checkbox" checked={autoEnabled} onChange={e => setAutoEnabled(e.target.checked)} />
                <span className="toggle-track"><span className="toggle-thumb" /></span>
                <span className="toggle-text">Auto-send</span>
              </label>
              <input type="time" className="time-input" value={autoTime}
                onChange={e => setAutoTime(e.target.value)} disabled={!autoEnabled} />
              <button className="btn btn-ghost btn-sm" onClick={handleSaveSettings}>
                {settingsSaved ? 'Saved ✓' : 'Save'}
              </button>
            </div>

            {autoEnabled && (
              <p className="autosend-hint">Will auto-send at {formatTime12h(autoTime)} on weekdays. App must be running.</p>
            )}

            <div className="field">
              <div className="notes-header">
                <label htmlFor="eod-notes">Report</label>
                <div className="preview-tabs">
                  <button type="button" className={`preview-tab${!previewMode ? ' active' : ''}`} onClick={() => setPreviewMode(false)}>Write</button>
                  <button type="button" className={`preview-tab${previewMode ? ' active' : ''}`}  onClick={() => setPreviewMode(true)}>Preview</button>
                </div>
              </div>
              <FormatToolbar textareaRef={eodTextareaRef} value={eodNotes}
                onChange={v => { setEodNotes(v); debouncedSave(date, v) }} />
              {previewMode ? (
                <div className="tg-preview" dangerouslySetInnerHTML={{ __html: eodNotes.trim()
                  ? `<span class="tg-preview-header"><b><u>EOD Summary - ${formatDateDisplay(date)}</u></b></span>\n\n${eodNotes}`
                  : '<span class="tg-preview-empty">Nothing to preview yet…</span>'
                }} />
              ) : (
                <textarea id="eod-notes" ref={eodTextareaRef} value={eodNotes}
                  onChange={handleEodNotesChange} onKeyDown={handleEodNotesKeyDown}
                  placeholder="Write your end-of-day report here…" rows={13} spellCheck={true} />
              )}
            </div>

            {status && (
              <div className={`status-bar status-${status.type}`} role="alert">
                <span className="status-icon">
                  {status.type === 'success' ? '✓' : status.type === 'error' ? '✕' : 'i'}
                </span>
                {status.message}
              </div>
            )}

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

            <section className="history-section">
              <button className="history-toggle" onClick={() => setShowHistory(v => !v)} aria-expanded={showHistory}>
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
                            <button className="btn-delete" onClick={() => handleDeleteHistory(i)} title="Delete">✕</button>
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

        {/* ══ Notes tab ════════════════════════════════════════════════════ */}
        {activeTab === 'notes' && (
          <div className="notes-panel">
            <div className="note-tabs-bar">
              {notesTabs.map(note => (
                <div key={note.id}
                  className={`note-tab${activeNoteId === note.id ? ' active' : ''}`}
                  onClick={() => switchNote(note.id)}
                  onDoubleClick={() => startRenaming(note.id, note.name)}
                  title="Double-click to rename"
                >
                  {editingNoteId === note.id ? (
                    <input className="note-tab-rename" value={editingNoteName}
                      onChange={e => setEditingNoteName(e.target.value)}
                      onBlur={confirmRename}
                      onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setEditingNoteId(null) }}
                      autoFocus onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span className="note-tab-name">{note.name}</span>
                  )}
                  {notesTabs.length > 1 && (
                    <button className="note-tab-close"
                      onClick={e => { e.stopPropagation(); deleteNote(note.id) }} title="Close">✕</button>
                  )}
                </div>
              ))}
              <button className="note-tab-add" onClick={addNote} title="New note">+</button>
            </div>

            {activeNote && (
              <RichTextEditor
                key={activeNote.id}
                content={activeNote.content}
                onChange={content => updateNoteContent(activeNote.id, content)}
              />
            )}
          </div>
        )}

      </main>
    </div>
  )
}
