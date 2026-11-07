import { expect, test } from 'claude-code/testing'

import { candidates, fromHref, hasRichBlocks, linkify, toHref } from '../hooks/paths'

const CWD = 'C:\\Users\\me\\proj'

test('a Windows path becomes a file link and comes back the same', async () => {
  const href = toHref('C:\\Users\\me\\My Docs\\a#1.txt')
  expect(href).toBe('file:///C:/Users/me/My%20Docs/a%231.txt')
  expect(fromHref(href!)).toBe('C:\\Users\\me\\My Docs\\a#1.txt')
})

test('a POSIX path round-trips', async () => {
  const href = toHref('/home/me/a.txt')
  expect(href).toBe('file:///home/me/a.txt')
  expect(fromHref(href!)).toBe('/home/me/a.txt')
})

test('a UNC path round-trips', async () => {
  const href = toHref('\\\\server\\share\\a.txt')
  expect(href).toBe('file://server/share/a.txt')
  expect(fromHref(href!)).toBe('\\\\server\\share\\a.txt')
})

test('plain text: path linked and escaped, line suffix and full stop kept outside', async () => {
  const out = linkify('Saved to C:\\tmp\\out_1.png:12.', CWD)
  expect(out.text).toBe('Saved to [C:\\\\tmp\\\\out\\_1.png](file:///C:/tmp/out_1.png):12.')
  expect(out.hrefs).toEqual(['file:///C:/tmp/out_1.png'])
})

test('a path with spaces links as far as the file that exists', async () => {
  const real = 'C:\\Program Files\\My App\\log.txt'
  const text = `See ${real} and then C:\\b.txt here.`
  expect(candidates(text, CWD)).toContain(real)
  const out = linkify(text, CWD, abs => abs === real || abs === 'C:\\b.txt')
  expect(out.hrefs).toEqual(['file:///C:/Program%20Files/My%20App/log.txt', 'file:///C:/b.txt'])
  expect(out.text.endsWith(' here.')).toBe(true)
})

test('a path that does not exist is left as text', async () => {
  const out = linkify('Look at /api/users/list.json now', CWD, () => false)
  expect(out.text).toBe('Look at /api/users/list.json now')
})

test('inline code holding a path with spaces is linked whole', async () => {
  const out = linkify('Open `C:\\My Docs\\a.md:3`', CWD)
  expect(out.text).toBe('Open [`C:\\My Docs\\a.md:3`](file:///C:/My%20Docs/a.md)')
})

test('inline code holding a relative path is linked against the cwd', async () => {
  const out = linkify('See `hooks/register.tsx:40` now', CWD)
  expect(out.text).toBe(
    'See [`hooks/register.tsx:40`](file:///C:/Users/me/proj/hooks/register.tsx) now',
  )
})

test('a Windows relative path with backslashes resolves against the cwd', async () => {
  const out = linkify('Edit .\\src\\a.ts please', CWD)
  expect(out.hrefs).toEqual(['file:///C:/Users/me/proj/src/a.ts'])
})

test('a Git Bash path on a Windows session becomes a drive path', async () => {
  const out = linkify('Wrote /c/Users/me/x.txt', CWD)
  expect(out.hrefs).toEqual(['file:///C:/Users/me/x.txt'])
  expect(fromHref(out.hrefs[0]!)).toBe('C:\\Users\\me\\x.txt')
})

test('code fences, URLs and existing links are left alone', async () => {
  const text = [
    '```bash',
    'cat C:\\tmp\\x.txt',
    '```',
    'Go to https://github.com/a/b/c.md and [doc](C:/tmp/y.md).',
    'Inline `npm run build` stays.',
  ].join('\n')
  const out = linkify(text, CWD)
  expect(out.text).toBe(text)
  expect(out.hrefs).toEqual([])
})

test('words with slashes but no extension are not paths', async () => {
  const out = linkify('Use and/or either/or here.', CWD)
  expect(out.hrefs).toEqual([])
})

test('fences, tables and alerts count as rich blocks; plain prose does not', async () => {
  expect(hasRichBlocks('```ts\nx\n```')).toBe(true)
  expect(hasRichBlocks('| a | b |\n|---|---|\n| 1 | 2 |')).toBe(true)
  expect(hasRichBlocks('> [!WARNING]\n> careful')).toBe(true)
  expect(hasRichBlocks('Just text - with a dash.')).toBe(false)
})
