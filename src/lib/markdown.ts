// Tiny safe Markdown renderer — no external deps, no rulebook content.
// Supports headings (#–###), bold, italic, inline code, unordered/ordered
// lists, blockquotes, and links. All raw HTML is escaped before any markup
// is applied, so user text can never inject markup or scripts.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeHref(raw: string): string | null {
  const href = raw.trim()
  if (/^(https?:\/\/|mailto:)/i.test(href)) return href
  return null
}

function renderInline(escaped: string): string {
  let out = escaped
  // Inline code first so its contents are not parsed as emphasis.
  out = out.replace(/`([^`]+)`/g, (_m, code: string) => `<code>${code}</code>`)
  // Links: [text](href) — only http(s)/mailto survive.
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text: string, href: string) => {
    const safe = safeHref(href)
    return safe ? `<a href="${safe}" rel="noopener noreferrer">${text}</a>` : text
  })
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  out = out.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>')
  return out
}

export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const html: string[] = []
  let i = 0
  const flushParagraph = (buf: string[]) => {
    if (buf.length) html.push(`<p>${renderInline(buf.join(' '))}</p>`)
  }
  while (i < lines.length) {
    const raw = lines[i]
    const line = escapeHtml(raw)
    const trimmed = raw.trim()
    if (!trimmed) { i++; continue }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed)
    if (heading) {
      const level = heading[1].length
      html.push(`<h${level}>${renderInline(escapeHtml(heading[2]))}</h${level}>`)
      i++; continue
    }
    if (trimmed.startsWith('&gt;') || trimmed.startsWith('>')) {
      const quote: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quote.push(escapeHtml(lines[i].trim().replace(/^>\s?/, '')))
        i++
      }
      html.push(`<blockquote>${renderInline(quote.join(' '))}</blockquote>`)
      continue
    }
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(`<li>${renderInline(escapeHtml(lines[i].trim().replace(/^[-*]\s+/, '')))}</li>`)
        i++
      }
      html.push(`<ul>${items.join('')}</ul>`)
      continue
    }
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(`<li>${renderInline(escapeHtml(lines[i].trim().replace(/^\d+[.)]\s+/, '')))}</li>`)
        i++
      }
      html.push(`<ol>${items.join('')}</ol>`)
      continue
    }
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,3})\s+/.test(lines[i].trim()) &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+[.)]\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('>')
    ) {
      para.push(escapeHtml(lines[i].trim()))
      i++
    }
    flushParagraph(para)
  }
  return html.join('\n')
}
