import { expect, test } from 'claude-code/testing'

const REPLY = (text: string) =>
  ({
    plugin: 'clickable-paths',
    component: 'AssistantMessage',
    requestId: 'msg-1',
    surface: 'terminal',
    props: { text, isFirstOfReply: true },
  }) as const

test('a click on a path in a reply opens Explorer with the file selected', async ($, on) => {
  const ran: (readonly string[])[] = []
  on('store.get', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'clickable-paths' } }))
  on('fs.exists', () => ({ value: true }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 0, isLink: false } }))
  on('process.run', (_, e) => {
    ran.push(e.argv)
    return { value: { exitCode: 1, stdout: '', stderr: '' } }
  })
  await $.session.start({ cwd: 'C:\\proj', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount(REPLY('Wrote C:\\proj\\out.txt.'))
  await ui.press({ key: 'cp-msg-1', link: { href: 'file:///C:/proj/out.txt' } })

  expect(ran).toEqual([['explorer.exe', '/select,C:\\proj\\out.txt']])
  await ui.unmount()
})

test('a reply with no paths goes to the engine untouched', async ($, on) => {
  on('store.get', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount(REPLY('Nothing to link here.'))
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})
