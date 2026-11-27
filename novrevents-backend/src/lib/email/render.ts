import { appUrl } from '../../config/env.js'

/**
 * Emails are described as a list of blocks and rendered to both HTML and plain text from the same
 * source. Every piece of text is HTML-escaped here, so organiser-supplied content can never inject
 * markup into a message.
 */
export type EmailBlock =
  | { kind: 'text'; text: string }
  | { kind: 'button'; label: string; url: string }
  | { kind: 'facts'; rows: Array<[label: string, value: string]> }
  | { kind: 'note'; text: string }

export interface EmailContent {
  subject: string
  heading: string
  blocks: EmailBlock[]
  /** Hex colour for the button and header rule. Falls back to the platform accent. */
  accent?: string | null
  /** Shown in the footer of non-essential mail. */
  unsubscribeUrl?: string | null
  /** One line explaining why the recipient is getting this message. */
  reason?: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

const DEFAULT_ACCENT = '#632D8A'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const multiline = (value: string) => escapeHtml(value).replace(/\r?\n/g, '<br>')

function blockToHtml(block: EmailBlock, accent: string): string {
  switch (block.kind) {
    case 'text':
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f2933;">${multiline(block.text)}</p>`
    case 'note':
      return `<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#52606d;">${multiline(block.text)}</p>`
    case 'button':
      return `<p style="margin:8px 0 24px;"><a href="${escapeHtml(block.url)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px;">${escapeHtml(block.label)}</a></p>`
    case 'facts': {
      const rows = block.rows
        .map(
          ([label, value]) =>
            `<tr><td style="padding:6px 16px 6px 0;font-size:13px;color:#52606d;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:6px 0;font-size:14px;color:#1f2933;">${multiline(value)}</td></tr>`,
        )
        .join('')
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse;">${rows}</table>`
    }
  }
}

function blockToText(block: EmailBlock): string {
  switch (block.kind) {
    case 'text':
    case 'note':
      return block.text
    case 'button':
      return `${block.label}: ${block.url}`
    case 'facts':
      return block.rows.map(([label, value]) => `${label}: ${value}`).join('\n')
  }
}

export function renderEmail(content: EmailContent): RenderedEmail {
  const accent = /^#[0-9a-fA-F]{6}$/.test(content.accent ?? '')
    ? (content.accent as string)
    : DEFAULT_ACCENT
  const body = content.blocks.map((block) => blockToHtml(block, accent)).join('\n')
  const footerLines = [
    content.reason ? escapeHtml(content.reason) : null,
    content.unsubscribeUrl
      ? `<a href="${escapeHtml(content.unsubscribeUrl)}" style="color:#52606d;">Unsubscribe or manage email preferences</a>`
      : null,
    `Sent by <a href="${escapeHtml(appUrl)}" style="color:#52606d;">NovrEvents</a>, a Cybernovr platform.`,
  ].filter(Boolean)

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(content.subject)}</title></head>
<body style="margin:0;padding:0;background:#f6f3f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3f7;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e4e7eb;">
<tr><td style="padding:20px 28px;border-bottom:3px solid ${accent};font-size:14px;font-weight:700;letter-spacing:-0.04em;color:#261c29;font-size:23px;">NovrEvents</td></tr>
<tr><td style="padding:28px;">
<h1 style="margin:0 0 20px;font-size:21px;line-height:1.3;color:#261c29;">${escapeHtml(content.heading)}</h1>
${body}
</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #e4e7eb;font-size:12px;line-height:1.6;color:#52606d;">${footerLines.join('<br>')}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  const textParts = [
    content.heading,
    '',
    ...content.blocks.flatMap((block) => [blockToText(block), '']),
  ]
  if (content.reason) textParts.push(content.reason)
  if (content.unsubscribeUrl)
    textParts.push(`Unsubscribe or manage email preferences: ${content.unsubscribeUrl}`)
  textParts.push(`Sent by NovrEvents, a Cybernovr platform — ${appUrl}`)

  return { subject: content.subject, html, text: textParts.join('\n') }
}
