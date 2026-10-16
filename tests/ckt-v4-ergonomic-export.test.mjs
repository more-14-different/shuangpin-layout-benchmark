import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const repo = path.resolve(import.meta.dirname, '..');
const exporter = path.join(repo, 'tools', 'export_ckt_v4_ergonomic_fixture.py');
const replay = path.join(
  repo,
  'a7_CKT_R11_integrated_materials',
  'R11_integrated_replay.zip',
);
const html = path.join(repo, 'a7_CKT_R11.html');

function exportFixture(output) {
  const result = spawnSync(
    'python',
    [exporter, '--replay', replay, '--html', html, '--output', output],
    {cwd: repo, encoding: 'utf8'},
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return readFileSync(output, 'utf8');
}

test('ergonomic exporter freezes a deterministic, complete R11 contract', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'ckt-v4-ergonomic-'));
  try {
    const firstPath = path.join(directory, 'first.json');
    const secondPath = path.join(directory, 'second.json');
    const first = exportFixture(firstPath);
    const second = exportFixture(secondPath);
    assert.equal(second, first);

    const fixture = JSON.parse(first);
    assert.equal(fixture.version, 'ckt-v4-ergonomics-1');
    assert.equal(fixture.verificationStatus, 'exact');
    assert.equal(fixture.tokenOrder.length, 67);
    assert.deepEqual(fixture.tokenOrder.slice(-5), [
      'tone1', 'tone2', 'tone3', 'tone4', 'tone5',
    ]);
    assert.equal(fixture.loadModel.tracks.length, 20);
    assert.equal(fixture.loadModel.masses.length, 20);
    assert.ok(fixture.loadModel.masses.every(row => row.length === 67));
    assert.equal(fixture.loadModel.keys.length, 34);

    for (const corpusName of ['daily', 'default']) {
      const corpus = fixture.movingHand.corpora[corpusName];
      assert.ok(corpus.tokens.length > 0);
      assert.ok(corpus.tokens.some(token => token.key));
      assert.ok(corpus.tokens.some(token => token.pinyin));
      assert.deepEqual(Object.keys(corpus.variants).sort(), [
        'hanzi-only', 'native-punctuation',
      ]);
    }
    assert.deepEqual(Object.keys(fixture.movingHand.geometry).sort(),
      [...fixture.movingHand.keys].sort());

    for (const hash of Object.values(fixture.sourceHashes)) {
      assert.match(hash, /^[0-9a-f]{64}$/);
    }
    for (const id of ['S005-NF', 'SNF4-M36-AE-07']) {
      const expected = fixture.expected[id];
      assert.equal(expected.layout.length, 67);
      assert.deepEqual(Object.keys(expected.loads).sort(), [
        'home_c4', 'home_floor', 'home_s2', 'home_wx',
        'rp_max', 'rp_s2', 'w_max', 'y_max',
      ]);
      assert.deepEqual(Object.keys(expected.movingHand).sort(), [
        'daily|hanzi-only',
        'daily|native-punctuation',
        'default|hanzi-only',
        'default|native-punctuation',
      ]);
      assert.ok(Object.values(expected.movingHand).every(value => value.unit ===
        'relative hand-model cost; not ms'));
    }
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
});
