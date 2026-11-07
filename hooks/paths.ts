// Finds file paths in markdown and turns them into file: links.

const WIN = String.raw`(?<![\w/\\])[A-Za-z]:[\\/][^\s<>"|?*\`()\[\]{}]*`
const UNC = String.raw`\\\\[^\s\\<>"|?*\`()\[\]{}]+\\[^\s<>"|?*\`()\[\]{}]*`
const POSIX = String.raw`(?<![\w.~:/\\-])/(?:[\w.@+-]+/)*[\w.@+-]+`
const REL = String.raw`(?<![\w.~:/\\@-])(?:\.{1,2}/)?(?:[\w.@+-]+/)+[\w@+-][\w.@+-]*\.[A-Za-z0-9]{1,8}`

const PATH = new RegExp(`${UNC}|${WIN}|${POSIX}|${REL}`, 'g')
const WHOLE = new RegExp(`^(?:${UNC}|${WIN}|${POSIX}|${REL})$`)
const TAIL = /(?::\d+(?::\d+)?)?[.,;:!?'")\]]*$/

export type Linked = { text: string; hrefs: string[] }

// Splits a match into the path and what trails it (":12", a full stop).
function split(raw: string): { path: string; rest: string } {
  const m = TAIL.exec(raw)
  const cut = m && m[0] ? raw.length - m[0].length : raw.length
  return { path: raw.slice(0, cut), rest: raw.slice(cut) }
}

function isAbsolute(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\') || p.startsWith('/')
}

function join(cwd: string, rel: string): string {
  const sep = cwd.includes('\\') ? '\\' : '/'
  const parts = cwd.replace(/[\\/]+$/, '').split(/[\\/]/)
  for (const seg of rel.split('/')) {
    if (seg === '.' || seg === '') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join(sep)
}

// A native path to a file: URL. Returns undefined when it cannot be made absolute.
export function toHref(path: string, cwd?: string): string | undefined {
  let abs = path
  if (!isAbsolute(path)) {
    if (!cwd) return undefined
    abs = join(cwd, path)
  }
  const slashed = abs.replace(/\\/g, '/')
  const enc = encodeURI(slashed).replace(/#/g, '%23').replace(/\?/g, '%3F')
  if (slashed.startsWith('//')) return `file:${enc}`
  if (/^[A-Za-z]:/.test(slashed)) return `file:///${enc}`
  return `file://${enc}`
}

// A file: URL back to a native path, with backslashes for a Windows path.
export function fromHref(href: string): string {
  let p = decodeURIComponent(href.replace(/^file:/i, ''))
  if (p.startsWith('///')) p = p.slice(2)
  if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1)
  if (/^[A-Za-z]:/.test(p) || p.startsWith('//')) p = p.replace(/\//g, '\\')
  return p
}

function linkPlain(seg: string, cwd: string | undefined, hrefs: string[]): string {
  // Markdown links and URLs stay as written: only the text between them is scanned.
  const pieces = seg.split(/(!?\[[^\]]*\]\([^)]*\)|<[a-z]+:[^>]*>|[a-z][a-z0-9+.-]*:\/\/\S+)/i)
  return pieces.map((p, i) => (i % 2 ? p : linkBare(p, cwd, hrefs))).join('')
}

function linkBare(seg: string, cwd: string | undefined, hrefs: string[]): string {
  return seg.replace(PATH, raw => {
    const { path, rest } = split(raw)
    if (path.length < 3) return raw
    const href = toHref(path, cwd)
    if (!href) return raw
    hrefs.push(href)
    return `[${path}](${href})${rest}`
  })
}

function linkCode(code: string, cwd: string | undefined, hrefs: string[]): string {
  const inner = code.slice(1, -1)
  const { path } = split(inner)
  if (!WHOLE.test(path)) return code
  const href = toHref(path, cwd)
  if (!href) return code
  hrefs.push(href)
  return `[${code}](${href})`
}

// Links every path outside fenced code blocks. An inline code span is linked
// only when it holds one path (with an optional ":line"), as `[`path`](url)`.
export function linkify(text: string, cwd?: string): Linked {
  const hrefs: string[] = []
  const out: string[] = []
  let inFence = false
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      out.push(line)
      continue
    }
    if (inFence) {
      out.push(line)
      continue
    }
    const parts = line.split(/(`[^`\n]+`)/)
    out.push(
      parts
        .map((p, i) => (i % 2 ? linkCode(p, cwd, hrefs) : linkPlain(p, cwd, hrefs)))
        .join(''),
    )
  }
  return { text: out.join('\n'), hrefs: [...new Set(hrefs)] }
}

export function hasFence(text: string): boolean {
  return /^\s*(```|~~~)/m.test(text)
}
