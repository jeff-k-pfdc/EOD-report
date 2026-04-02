import cron from 'node-cron'
import { getDraft, getSettings, addHistory, clearDraft } from './storage.js'
import { sendToTelegram } from './telegram.js'

let currentTask = null

export function scheduleAutoSend() {
  if (currentTask) { currentTask.stop(); currentTask = null }

  const { autoSendEnabled, autoSendTime } = getSettings()
  if (!autoSendEnabled || !autoSendTime) {
    console.log('[Scheduler] Auto-send disabled.')
    return
  }

  const [hour, minute] = autoSendTime.split(':').map(Number)
  if (isNaN(hour) || isNaN(minute)) {
    console.warn('[Scheduler] Invalid autoSendTime — expected HH:MM.')
    return
  }

  // Mon–Fri only (1-5); weekends are skipped automatically
  currentTask = cron.schedule(`${minute} ${hour} * * 1-5`, async () => {
    const draft = getDraft()
    if (!draft?.notes?.trim()) return

    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      console.warn('[Scheduler] Telegram credentials missing.')
      return
    }

    try {
      await sendToTelegram(draft.date, draft.notes)
      addHistory({ date: draft.date, notes: draft.notes, submittedAt: new Date().toISOString(), auto: true })
      clearDraft()
      console.log(`[Scheduler] Auto-sent at ${autoSendTime}`)
    } catch (err) {
      console.error('[Scheduler] Failed:', err.message)
    }
  })

  console.log(`[Scheduler] Scheduled at ${autoSendTime} Mon–Fri`)
}
