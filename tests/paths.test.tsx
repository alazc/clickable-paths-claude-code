import { expect, test } from 'claude-code/testing'

import { fromHref, linkify, toHref } from '../hooks/paths'

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

test('plain text: path linked, line suffix and full stop kept outside', async () => {
  const out = linkify('Saved to C:\\tmp\\out.png:12.', CWD)
  expect(out.text).toBe('Saved to [C:\\tmp\\out.png](file:///C:/tmp/out.png):12.')
  expect(out.hrefs).toEqual(['file:///C:/tmp/out.png'])
})

test('inline code holding a relative path is linked against the cwd', async () => {
  const out = linkify('See `hooks/register.tsx:40` now', CWD)
  expect(out.text).toBe(
    'See [`hooks/register.tsx:40`](file:///C:/Users/me/proj/hooks/register.tsx) now',
  )
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
