import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

for (const name of ['README.md', 'README_CN.md']) {
  test(`${name} does not embed images`, () => {
    const path = fileURLToPath(new URL(`../${name}`, import.meta.url));
    const markdown = readFileSync(path, 'utf8');
    assert.doesNotMatch(markdown, /!\[[^\]]*\]\([^)]*\)/);
    assert.doesNotMatch(markdown, /<img\b/i);
  });
}

test('git ignores raster images but keeps SVG eligible for tracking', () => {
  const path = fileURLToPath(new URL('../.gitignore', import.meta.url));
  const ignore = readFileSync(path, 'utf8');
  for (const extension of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif', 'tif', 'tiff']) {
    assert.match(ignore, new RegExp(`^\\*\\.${extension}$`, 'm'));
  }
  assert.doesNotMatch(ignore, /^\*\.svg$/m);
});
