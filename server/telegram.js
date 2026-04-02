import https from 'https'

function buildMessage(date, notes) {
  const [year, month, day] = date.split('-').map(Number)
  const dateStr = new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
  const escaped = notes.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<b><u>EOD Summary - ${dateStr}</u></b>\n\n${escaped}`
}

export function sendToTelegram(date, notes) {
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
      res.on('data', (chunk) => { raw += chunk })
      res.on('end', () => {
        let parsed
        try { parsed = JSON.parse(raw) } catch {
          return reject(new Error('Telegram returned an unreadable response.'))
        }
        parsed.ok ? resolve() : reject(new Error(parsed.description || 'Telegram API error.'))
      })
    })

    req.on('error', (err) => reject(new Error(`Network error: ${err.message}`)))
    req.write(body)
    req.end()
  })
}
