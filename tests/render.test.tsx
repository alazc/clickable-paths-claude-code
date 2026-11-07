import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code/testing'

import { explorerLaunch } from '../hooks/register'

type Ran = { argv: readonly string[]; env?: Record<string, string> }

test('the path reaches PowerShell as data, never as script text', async () => {
  const attacks = [
    "\\\\a\\b’;calc;’",
    "C:\\a\\b';calc;'.txt",
    'C:\\a\\$(calc).txt',
    'C:\\a\\`calc`.txt',
  ]
  const script = explorerLaunch('C:\\x.txt', false).argv
  for (const path of attacks) {
    const launch = explorerLaunch(path, false)
    // The script is one constant: nothing of the path is in it.
    expect(launch.argv).toEqual(script)
    expect(launch.env.CLICKABLE_PATHS_TARGET).toBe(path)
    expect(launch.env.CLICKABLE_PATHS_SELECT).toBe('1')
  }
})

test('a trailing backslash cannot escape the closing quote', async () => {
  expect(explorerLaunch('C:\\proj\\', true).env.CLICKABLE_PATHS_TARGET).toBe('C:\\proj')
  expect(explorerLaunch('C:\\', true).env.CLICKABLE_PATHS_TARGET).toBe('C:\\\\')
  expect(explorerLaunch('C:\\proj', true).env.CLICKABLE_PATHS_SELECT).toBe('0')
})

const toasts: string[] = []

const REPLY = (text: string, surface: 'terminal' | 'mobile' = 'terminal') =>
  ({
    plugin: 'clickable-paths',
    component: 'AssistantMessage',
    requestId: 'msg-1',
    surface,
    props: { text, isFirstOfReply: true },
  }) as const

// Stands in for the engine: every path exists, every command is recorded,
// and anything the mod passes on draws as "engine: <text>".
function engine(on: On, ran: Ran[], existing: boolean | 'network' | (() => boolean) = true, exitCode = 0) {
  toasts.length = 0
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'clickable-paths' } }))
  on('fs.exists', () => {
    if (existing === 'network') throw new Error('network location')
    return { value: typeof existing === 'function' ? existing() : existing }
  })
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 0, isLink: false } }))
  on('process.run', (_, e) => {
    ran.push({ argv: e.argv, env: e.init?.env })
    return { value: { exitCode, stdout: '', stderr: '' } }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    const text = (e.props as { text?: string }).text ?? 'row'
    return <Text>engine: {text}</Text>
  })
}

test('a click on a path in a reply opens Explorer with the file selected', async ($, on) => {
  const ran: Ran[] = []
  engine(on, ran)
  await $.session.start({ cwd: 'C:\\proj', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount(REPLY('Wrote C:\\proj\\out.txt.'))
  await ui.press({ key: 'cp-msg-1', link: { href: 'file:///C:/proj/out.txt' } })

  expect(ran).toEqual([explorerLaunch('C:\\proj\\out.txt', false)])
  await ui.unmount()
})

test('a click on a UNC path goes straight to Explorer', async ($, on) => {
  const ran: Ran[] = []
  engine(on, ran, 'network')
  await $.session.start({ cwd: 'C:\\proj', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount(REPLY('On \\\\srv\\share\\a.txt now'))
  await ui.press({ key: 'cp-msg-1', link: { href: 'file://srv/share/a.txt' } })

  expect(ran).toEqual([explorerLaunch('\\\\srv\\share\\a.txt', false)])
  await ui.unmount()
})

test('a reply with no real paths goes to the engine untouched', async ($, on) => {
  engine(on, [], false)
  const ui = await $.ui.mount(REPLY('See /api/users/list.json here.'))
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe(
    'engine: See /api/users/list.json here.',
  )
  await ui.unmount()
})

test('a reply with a table goes to the renderers beneath, links added', async ($, on) => {
  engine(on, [])
  await $.session.start({ cwd: 'C:\\proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(REPLY('| f |\n|---|\n| C:\\proj\\a.txt |'))
  const drawn = await ui.find({ type: 'Text', text: /engine/ })
  expect(drawn?.text).toContain('(file:///C:/proj/a.txt)')
  await ui.unmount()
})

test('on a phone the reply is left alone', async ($, on) => {
  engine(on, [])
  const ui = await $.ui.mount(REPLY('Wrote C:\\proj\\out.txt.', 'mobile'))
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe(
    'engine: Wrote C:\\proj\\out.txt.',
  )
  await ui.unmount()
})

test('/clickable-paths turns the links off', async ($, on) => {
  engine(on, [])
  await $.session.start({ cwd: 'C:\\proj', surface: 'terminal', isInteractive: true })
  const said = await $.command.run({ command: 'clickable-paths', args: '' })
  expect(said.text).toBe('Clickable paths are off.')

  const ui = await $.ui.mount(REPLY('Wrote C:\\proj\\out.txt.'))
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe(
    'engine: Wrote C:\\proj\\out.txt.',
  )
  await ui.unmount()
  expect((await $.command.run({ command: 'clickable-paths', args: '' })).text).toBe(
    'Clickable paths are on.',
  )
})

test('a Write row gets a Show in folder link; a Read row does not', async ($, on) => {
  const ran: Ran[] = []
  engine(on, ran)
  await $.session.start({ cwd: 'C:\\proj', surface: 'terminal', isInteractive: true })
  const row = (tool: string) =>
    ({
      plugin: 'clickable-paths',
      component: 'ToolUse',
      requestId: `t-${tool}`,
      surface: 'terminal',
      props: {
        tool_use_id: `t-${tool}`,
        tool,
        input: { file_path: 'C:\\proj\\a.txt' },
        isRunning: false,
        isErrored: false,
        isInterrupted: false,
      },
    }) as const

  const write = await $.ui.mount(row('Write'))
  await write.press({ key: 'cp-tool-t-Write', link: { href: 'file:///C:/proj/a.txt' } })
  expect(ran).toEqual([explorerLaunch('C:\\proj\\a.txt', false)])
  await write.unmount()

  const read = await $.ui.mount(row('Read'))
  expect(await read.find({ type: 'Markdown' })).toBe(undefined)
  await read.unmount()
})

test('a launch that fails says so; Opening shows only for a file that exists', async ($, on) => {
  engine(on, [], true, 1)
  await $.session.start({ cwd: 'C:\\proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(REPLY('Wrote C:\\proj\\out.txt.'))
  await ui.press({ key: 'cp-msg-1', link: { href: 'file:///C:/proj/out.txt' } })
  expect(toasts).toEqual([
    'Opening out.txt in the file browser',
    'Could not open a file browser for C:\\proj\\out.txt',
  ])
  await ui.unmount()
})

test('a file deleted after it was linked says Not found, with no Opening', async ($, on) => {
  let isThere = true
  engine(on, [], () => isThere)
  await $.session.start({ cwd: 'C:\\proj', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(REPLY('Wrote C:\\proj\\gone.txt.'))
  isThere = false
  await ui.press({ key: 'cp-msg-1', link: { href: 'file:///C:/proj/gone.txt' } })
  expect(toasts).toEqual(['Not found: C:\\proj\\gone.txt'])
  await ui.unmount()
})
