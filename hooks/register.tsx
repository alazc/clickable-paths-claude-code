import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { candidates, fromHref, hasRichBlocks, hrefOf, isUnc, isWindowsPath, linkify, toAbsolute } from './paths'
import type { Linked } from './paths'

// Read is left out: it is the most common tool, and a line under every
// Read row is noise. These are the tools that change a file.
const FILE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit'])
const OFF_KEY = 'off'
const MISS_TTL_MS = 5000
const MAX_CACHE = 500

const isOff = atom({ plugin: 'clickable-paths', key: 'isOff' } as const, false)

// What the disk said about a path: kept for good when it exists, for a few
// seconds when it does not (Claude often names a file before it writes it).
const disk = new Map<string, { ok: boolean; at: number }>()
const linkedCache = new Map<string, Linked>()

function remember<K, V>(map: Map<K, V>, key: K, value: V): void {
  if (map.size >= MAX_CACHE) map.delete(map.keys().next().value as K)
  map.set(key, value)
}

async function exists($: EngineInterface, abs: string): Promise<boolean> {
  // $.fs.exists rejects a network location: a UNC path is taken on trust.
  if (isUnc(abs)) return true
  const known = disk.get(abs)
  if (known && (known.ok || Date.now() - known.at < MISS_TTL_MS)) return known.ok
  let ok = false
  try {
    ok = await $.fs.exists(abs)
  } catch {
    ok = false
  }
  remember(disk, abs, { ok, at: Date.now() })
  return ok
}

// Links the paths in `text` that exist on disk. A result is cached only when
// every path it could mean was answered, so a file written later gets linked.
async function link($: EngineInterface, text: string, cwd: string | undefined): Promise<Linked> {
  const key = `${cwd ?? ''}\n${text}`
  const cached = linkedCache.get(key)
  if (cached) return cached
  const real = new Set<string>()
  let isComplete = true
  for (const abs of candidates(text, cwd)) {
    if (await exists($, abs)) real.add(abs)
    else isComplete = false
  }
  const linked = linkify(text, cwd, abs => real.has(abs))
  if (isComplete) remember(linkedCache, key, linked)
  return linked
}

// Claude Code starts programs with a hidden window, and Explorer obeys that:
// its window opens invisible. Start-Process with -WindowStyle Normal asks
// for a visible one. A path holds no `"`; a `'` is doubled for PowerShell.
export function explorerArgv(path: string, isDir: boolean): string[] {
  const quoted = `"${path}"`.replace(/'/g, "''")
  const args = isDir ? quoted : `/select,${quoted}`
  return [
    'powershell.exe',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Start-Process explorer.exe -ArgumentList '${args}' -WindowStyle Normal`,
  ]
}

// Opens the system file browser with the path selected (a folder: opened).
async function reveal($: EngineInterface, href: string): Promise<void> {
  const path = fromHref(href)
  // Says the click reached the mod: a file that opens with no such message
  // was opened by the terminal itself.
  $.ui.toast(`Showing ${path.split(/[\\/]/).pop() || path} in the file browser`)
  try {
    if (isUnc(path)) {
      await $.process.run(explorerArgv(path, false))
      return
    }
    if (!(await $.fs.exists(path))) {
      $.ui.toast(`Not found: ${path}`)
      return
    }
    const isDir = (await $.fs.stat(path)).kind === 'dir'

    if (isWindowsPath(path)) {
      await $.process.run(explorerArgv(path, isDir))
      return
    }
    try {
      const mac = await $.process.run(isDir ? ['open', path] : ['open', '-R', path])
      if (mac.exitCode === 0) return
    } catch {
      // No `open`: not macOS. Go on to xdg-open.
    }
    const dir = isDir ? path : path.replace(/\/[^/]*$/, '') || '/'
    await $.process.run(['xdg-open', dir])
  } catch {
    $.ui.toast(`Could not open a file browser for ${path}`)
  }
}

export const register: Register = on => {
  let cwd: string | undefined

  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    const saved = (await $.store.get(OFF_KEY)) === true
    await update($, isOff, () => saved)
    await $.command.register({
      name: 'clickable-paths',
      description: 'Turn clickable file paths on or off',
    })
    return next(e)
  })

  on('command.run', { command: 'clickable-paths' }, async $ => {
    const now = !(await read($, isOff))
    await update($, isOff, () => now)
    await $.store.set(OFF_KEY, now)
    return { text: now ? 'Clickable paths are off.' : 'Clickable paths are on.' }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    // On a phone a press would open Explorer on the computer, not the phone.
    if (e.surface === 'mobile' || e.props.isSummary) return next(e)
    if (await read($, isOff)) return next(e)

    const linked = await link($, e.props.text, cwd)
    if (linked.hrefs.length === 0) return next(e)

    // Fences, tables and alerts go on to the renderers beneath (diagram and
    // table mods among them) with links in the text: the terminal opens those.
    if (hasRichBlocks(e.props.text)) return next({ ...e, props: { ...e.props, text: linked.text } })

    const { Markdown } = $.ui.resolve(e)
    return (
      <Markdown
        key={`cp-${e.requestId}`}
        text={linked.text}
        pressableLinks={linked.hrefs}
        onLinkPress={pressed => reveal($, pressed.href)}
      />
    )
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const row = await next(e)
    const { tool, input, isRunning, isErrored } = e.props
    if (e.surface === 'mobile' || !FILE_TOOLS.has(tool) || isRunning || isErrored) return row
    if (await read($, isOff)) return row

    const file = (input as { file_path?: unknown; notebook_path?: unknown }) ?? {}
    const path = typeof file.file_path === 'string' ? file.file_path : file.notebook_path
    if (typeof path !== 'string') return row
    const abs = toAbsolute(path, cwd)
    if (abs === undefined) return row
    const href = hrefOf(abs)

    const { Box, Markdown } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {row}
        <Markdown
          key={`cp-tool-${e.requestId}`}
          dimColor
          text={`  ↳ [Show in folder](${href})`}
          pressableLinks={[href]}
          onLinkPress={pressed => reveal($, pressed.href)}
        />
      </Box>
    )
  })
}
