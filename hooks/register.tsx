import type { EngineInterface, Register } from 'claude-code'

import { fromHref, hasFence, linkify, toHref } from './paths'

const FILE_TOOLS = new Set(['Write', 'Edit', 'Read', 'NotebookEdit'])
const OFF_KEY = 'off'

// Opens the system file browser with the path selected (a folder: opened).
async function reveal($: EngineInterface, href: string): Promise<void> {
  const path = fromHref(href)
  if (!(await $.fs.exists(path))) {
    $.ui.toast(`Not found: ${path}`)
    return
  }
  const stat = await $.fs.stat(path)
  const isDir = stat.kind === 'dir'
  const isWindows = /^[A-Za-z]:\\/.test(path) || path.startsWith('\\\\')

  try {
    if (isWindows) {
      // explorer.exe exits 1 on success, so its exit code says nothing.
      await $.process.run(isDir ? ['explorer.exe', path] : ['explorer.exe', `/select,${path}`])
      return
    }
    const mac = await $.process.run(isDir ? ['open', path] : ['open', '-R', path])
    if (mac.exitCode === 0) return
  } catch {
    // No `open`: not macOS. Fall through to xdg-open.
  }
  try {
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
    await $.command.register({
      name: 'clickable-paths',
      description: 'Turn clickable file paths on or off',
    })
    return next(e)
  })

  on('command.run', { command: 'clickable-paths' }, async $ => {
    const isOff = !(await $.store.get(OFF_KEY))
    await $.store.set(OFF_KEY, isOff)
    return { text: isOff ? 'Clickable paths are off.' : 'Clickable paths are on.' }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (await $.store.get(OFF_KEY)) return next(e)
    const linked = linkify(e.props.text, cwd)
    if (linked.hrefs.length === 0) return next(e)

    // A block with a code fence goes on to the renderers beneath (diagram
    // mods among them) with links in its text; the terminal opens those.
    if (hasFence(e.props.text)) return next({ ...e, props: { ...e.props, text: linked.text } })

    const { Markdown } = $.ui.resolve(e)
    return (
      <Markdown
        key={`cp-${e.requestId}`}
        text={linked.text}
        pressableLinks={linked.hrefs}
        onLinkPress={link => reveal($, link.href)}
      />
    )
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const row = await next(e)
    const { tool, input, isRunning, isErrored } = e.props
    if (!FILE_TOOLS.has(tool) || isRunning || isErrored) return row
    if (await $.store.get(OFF_KEY)) return row

    const file = (input as { file_path?: unknown; notebook_path?: unknown }) ?? {}
    const path = typeof file.file_path === 'string' ? file.file_path : file.notebook_path
    if (typeof path !== 'string') return row
    const href = toHref(path, cwd)
    if (!href) return row

    const { Box, Markdown } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {row}
        <Markdown
          key={`cp-tool-${e.requestId}`}
          dimColor
          text={`  ↳ [Show in folder](${href})`}
          pressableLinks={[href]}
          onLinkPress={link => reveal($, link.href)}
        />
      </Box>
    )
  })
}
