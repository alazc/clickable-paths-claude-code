// Finds file paths in markdown and turns them into file: links.

// Windows and UNC paths may hold spaces: a match runs to the end of the line,
// and `variants` cuts it back at each space so the caller can keep the one
// that exists on disk.
const WIN = String.raw`(?<![\w/\\])[A-Za-z]:[\\/][^<>"|?*\`\[\]{}\r\n]*`
const UNC = String.raw`(?<![\w\\])\\\\[^\s\\<>"|?*\`\[\]{}]+\\[^<>"|?*\`\[\]{}\r\n]*`
const POSIX = String.raw`(?<![\w.~:/\\-])/(?:[\w.@+-]+/)*[\w.@+-]+`
const REL = String.raw`(?<![\w.~:/\\@-])(?:\.{1,2}[\\/])?(?:[\w.@+-]+[\\/])+[\w@+-][\w.@+-]*\.[A-Za-z0-9]{1,8}`

const ANY = new RegExp(`(${UNC})|(${WIN})|(?:${POSIX}|${REL})`, 'g')
const WHOLE = new RegExp(`^(?:${UNC}|${WIN}|${POSIX}|${REL})$`)
const TAIL = /(?::\d+(?::\d+)?)?[\s.,;:!?'")\]]*$/
const MAX_SPACES = 8

export type Linked = { text: string; hrefs: string[] }
export type IsReal = (abs: string) => boolean

// Splits a match into the path and what trails it (":12", a full stop).
function split(raw: string): { path: string; rest: string } {
  const m = TAIL.exec(raw)
  const cut = m && m[0] ? raw.length - m[0].length : raw.length
  return { path: raw.slice(0, cut), rest: raw.slice(cut) }
}

export function isWindowsPath(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\')
}

export function isUnc(p: string): boolean {
  return p.startsWith('\\\\')
}

function join(cwd: string, rel: string): string {
  const sep = isWindowsPath(cwd) ? '\\' : '/'
  const parts = cwd.replace(/[\\/]+$/, '').split(/[\\/]/)
  for (const seg of rel.split(/[\\/]/)) {
    if (seg === '.' || seg === '') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join(sep)
}

// A path as written to a native absolute path, or undefined.
// On a Windows session a Git Bash path (/c/Users/x) becomes C:\Users\x.
export function toAbsolute(path: string, cwd?: string): string | undefined {
  const onWindows = cwd !== undefined && isWindowsPath(cwd)
  const bash = /^\/([A-Za-z])(\/.*)?$/.exec(path)
  if (onWindows && bash) return `${bash[1]!.toUpperCase()}:${(bash[2] ?? '/').replace(/\//g, '\\')}`
  if (isWindowsPath(path) || path.startsWith('/')) return path
  return cwd ? join(cwd, path) : undefined
}

// A native absolute path to a file: URL.
export function hrefOf(abs: string): string {
  const slashed = abs.replace(/\\/g, '/')
  const enc = encodeURI(slashed).replace(/#/g, '%23').replace(/\?/g, '%3F')
  if (slashed.startsWith('//')) return `file:${enc}`
  if (/^[A-Za-z]:/.test(slashed)) return `file:///${enc}`
  return `file://${enc}`
}

export function toHref(path: string, cwd?: string): string | undefined {
  const abs = toAbsolute(path, cwd)
  return abs === undefined ? undefined : hrefOf(abs)
}

// A file: URL back to a native path, with backslashes for a Windows path.
export function fromHref(href: string): string {
  let p = decodeURIComponent(href.replace(/^file:/i, ''))
  if (p.startsWith('///')) p = p.slice(2)
  if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1)
  if (/^[A-Za-z]:/.test(p) || p.startsWith('//')) p = p.replace(/\//g, '\\')
  return p
}

// Link text is markdown: a backslash or an underscore in a path is escaped.
function escapeText(s: string): string {
  return s.replace(/[\\`*_\[\]<>~|]/g, '\\$&')
}

// The ways to read a match that may hold spaces: longest first.
function variants(raw: string, isSpaced: boolean): { path: string; rest: string }[] {
  if (!isSpaced) return [split(raw)]
  const cuts: number[] = []
  for (let i = raw.indexOf(' '); i !== -1 && cuts.length < MAX_SPACES; i = raw.indexOf(' ', i + 1)) {
    cuts.push(i)
  }
  const ends = raw.indexOf(' ', (cuts.at(-1) ?? 0) + 1) === -1 ? [raw.length] : []
  return [...ends, ...cuts.reverse()]
    .map(end => split(raw.slice(0, end)))
    .filter(v => v.path.length >= 3)
}

type Found = { start: number; end: number; abs: string; path: string }

// Every path in a plain stretch of text that `isReal` accepts.
function findBare(seg: string, cwd: string | undefined, isReal: IsReal, seen?: string[]): Found[] {
  const found: Found[] = []
  ANY.lastIndex = 0
  for (let m = ANY.exec(seg); m; m = ANY.exec(seg)) {
    // A UNC path cannot be checked on disk, so in plain text it ends at its
    // first space (in a code span it may hold spaces).
    const isSpaced = m[2] !== undefined
    const raw = m[1] !== undefined ? m[0].split(' ')[0]! : m[0]
    let picked: Found | undefined
    for (const v of variants(raw, isSpaced)) {
      const abs = toAbsolute(v.path, cwd)
      if (abs === undefined) continue
      seen?.push(abs)
      if (!picked && isReal(abs)) {
        picked = { start: m.index, end: m.index + v.path.length, abs, path: v.path }
        if (!seen) break
      }
    }
    if (picked) {
      found.push(picked)
      ANY.lastIndex = picked.end
    } else if (isSpaced) {
      // Nothing fits: go on after the first word so later paths are found.
      const space = m[0].indexOf(' ')
      ANY.lastIndex = m.index + (space === -1 ? m[0].length : space)
    }
  }
  return found
}

function linkBare(seg: string, cwd: string | undefined, isReal: IsReal, hrefs: string[]): string {
  let out = ''
  let at = 0
  for (const f of findBare(seg, cwd, isReal)) {
    const href = hrefOf(f.abs)
    hrefs.push(href)
    out += seg.slice(at, f.start) + `[${escapeText(f.path)}](${href})`
    at = f.end
  }
  return out + seg.slice(at)
}

// Markdown links and URLs stay as written: only the text between them is scanned.
const PROTECTED = /(!?\[[^\]]*\]\([^)]*\)|<[a-z]+:[^>]*>|[a-z][a-z0-9+.-]*:\/\/\S+)/i

function linkPlain(seg: string, cwd: string | undefined, isReal: IsReal, hrefs: string[]): string {
  return seg
    .split(PROTECTED)
    .map((p, i) => (i % 2 ? p : linkBare(p, cwd, isReal, hrefs)))
    .join('')
}

function codePath(code: string, cwd: string | undefined): string | undefined {
  const { path } = split(code.slice(1, -1))
  return WHOLE.test(path) ? toAbsolute(path, cwd) : undefined
}

function linkCode(code: string, cwd: string | undefined, isReal: IsReal, hrefs: string[]): string {
  const abs = codePath(code, cwd)
  if (abs === undefined || !isReal(abs)) return code
  const href = hrefOf(abs)
  hrefs.push(href)
  return `[${code}](${href})`
}

// Calls `onPlain` and `onCode` for each piece of text outside code fences.
function eachPiece(text: string, onPlain: (s: string) => string, onCode: (s: string) => string): string {
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
    out.push(parts.map((p, i) => (i % 2 ? onCode(p) : onPlain(p))).join(''))
  }
  return out.join('\n')
}

// Every absolute path the text could mean, for the caller to check on disk.
export function candidates(text: string, cwd?: string): string[] {
  const seen: string[] = []
  eachPiece(
    text,
    plain => {
      for (const p of plain.split(PROTECTED).filter((_, i) => i % 2 === 0)) {
        findBare(p, cwd, () => false, seen)
      }
      return plain
    },
    code => {
      const abs = codePath(code, cwd)
      if (abs !== undefined) seen.push(abs)
      return code
    },
  )
  return [...new Set(seen)]
}

// Links every path outside fenced code blocks that `isReal` accepts. An inline
// code span is linked only when it holds one path (with an optional ":line").
export function linkify(text: string, cwd?: string, isReal: IsReal = () => true): Linked {
  const hrefs: string[] = []
  const linked = eachPiece(
    text,
    plain => linkPlain(plain, cwd, isReal, hrefs),
    code => linkCode(code, cwd, isReal, hrefs),
  )
  return { text: linked, hrefs: [...new Set(hrefs)] }
}

// Blocks that other renderers draw best (diagram and table mods): fences,
// tables and GitHub alerts.
export function hasRichBlocks(text: string): boolean {
  return (
    /^\s*(```|~~~)/m.test(text) ||
    /^(?=[^\n]*\|)(?=[^\n]*-{3})[ \t|:-]+$/m.test(text) ||
    /^\s*>\s*\[!\w+\]/m.test(text)
  )
}
