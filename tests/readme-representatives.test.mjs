import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {render} from '../tools/update_readme_representatives.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('README representative/adoption generator is idempotent', () => {
  const result = spawnSync(process.execPath, ['tools/update_readme_representatives.mjs', '--check'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('generator patches legacy sections while preserving a footer', () => {
  const legacy = [
    '# 示例',
    '',
    '## 代表方案性能',
    '',
    '旧表',
    '',
    '## 实战采用',
    '',
    '旧方案',
    '',
    '下载：保留',
    '',
    '[^keep]: 保留',
    '',
  ].join('\n');
  const output = render(legacy, 'github');
  assert.match(output, /README_REPRESENTATIVES:START/);
  assert.match(output, /README_ADOPTION:START/);
  assert.match(output, /\| CKT v4 ↓ \|/);
  assert.match(output, /下载：保留/);
  assert.match(output, /\[\^keep\]: 保留/);
  assert.doesNotMatch(output, /旧表|旧方案/);
});
