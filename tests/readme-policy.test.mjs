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

test('generated README sections name and link the current production schemes', () => {
  for (const name of ['README.md', 'README_CN.md']) {
    const path = fileURLToPath(new URL(`../${name}`, import.meta.url));
    const markdown = readFileSync(path, 'utf8');
    assert.match(markdown, /README_REPRESENTATIVES:START/);
    assert.match(markdown, /README_ADOPTION:START/);
    assert.match(markdown, /\| CKT v4 ↓ \|/);
    assert.match(markdown, /SNOW-SHENYUN-21X26-D3V1-BALANCED/);
    assert.match(markdown, /QZ-e8f37a0998f9/);
    assert.match(markdown, /U357-21X21-M40-D0/);
    assert.match(markdown, /SNOW-SHENYUN-21X26-PRODUCTION/);
    assert.match(markdown, /snow_jiandao\.schema\.yaml/);
    assert.match(markdown, /snow_sanpin\.schema\.yaml/);
    assert.match(markdown, /snow_shenyun_shape\.schema\.yaml/);
    assert.match(markdown, /snow_shenyun_tone\.schema\.yaml/);
    assert.match(markdown, /snow_jiandao_first\.schema\.yaml/);
    assert.match(markdown, /snow_sanpin_first\.schema\.yaml/);
    assert.match(markdown, /snow_shenyun_shape_first\.schema\.yaml/);
    assert.match(markdown, /snow_shenyun_tone_first\.schema\.yaml/);
    assert.match(markdown, /^下载：/m);
    assert.match(markdown, /^\[\^common399\]:/m);
    assert.doesNotMatch(markdown, /`R9-21X21-M40-02` 已投入生产/);
    assert.doesNotMatch(markdown, /%E6%97%A0%E9%A3%9E%E9%94%AE%E9%81%93%E7%A5%9E%E9%9F%B5-%E5%8F%8C%E6%8B%BC%E7%BC%96%E7%A0%81%E6%96%B9%E6%A1%88/);
  }
});
