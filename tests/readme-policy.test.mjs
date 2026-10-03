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

test('adoption copy names the current Shenyun R9 scheme', () => {
  for (const name of ['README.md', 'README_CN.md', 'release/R11_RELEASE_NOTES.md']) {
    const path = fileURLToPath(new URL(`../${name}`, import.meta.url));
    const markdown = readFileSync(path, 'utf8');
    assert.match(markdown, /`R9-21X21-M40-02` 已(?:投入生产\/实战，被|用于) .*“无(?:\[[^\]]+\]\([^)]+\)|飞键)道・神韵”/);
    assert.doesNotMatch(markdown, /`R8-21X21-M40-01` 已(?:投入生产\/实战，被|用于)/);
    assert.doesNotMatch(markdown, /`R10-21X26-M39-08` (?:也)?即将被/);
  }
});
