import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const {imageFirstKey} = require('../tools/audit_pindu_nextgen_image.js');
const {onsetDiagnostics, toneRegions} = require('../tools/export_toned_2121_rust_trial.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('AVUIO 7/8/6 fixture derives D9/F9 from emitted codes', () => {
  const layouts = JSON.parse(fs.readFileSync(path.join(root,
    'research/config/ckt-v51-toned-2121-pindu11-uneven786-finalists.json')));
  const seeds = JSON.parse(fs.readFileSync(path.join(root,
    'research/config/ckt-v51-toned-2121-seeds.json')));
  const layout = layouts.layouts[0];
  const decomposition = new Map(seeds.decomposition.map(value => [value.pinyin, value]));
  const atoms = new Map();
  for (let index = 0; index < layouts.tokenKeys.length; index++) {
    const pinyin = layouts.tokenKeys[index].replace(/[1-5]$/u, '');
    const split = decomposition.get(pinyin);
    const key = layout.tonedCodes[index][0];
    const atom = atoms.get(split.shengjie) || {
      name: split.shengjie,
      initial: split.initial,
      baselineKey: key,
    };
    assert.equal(atom.baselineKey, key);
    atoms.set(split.shengjie, atom);
  }
  const canonical = Object.fromEntries(
    [...'bpmfdtnlgkhjqxrzcs'].map(initial => [initial, imageFirstKey(initial)]));
  assert.deepEqual(onsetDiagnostics([...atoms.values()], canonical), {
    traditionalOnsetD: 9,
    onsetFragmentation: 9,
    onsetKeyIncidences: 27,
  });
});

test('AVUIO fixture exposes four/home23/lower1-neutral legal rhyme regions', () => {
  const layouts = JSON.parse(fs.readFileSync(path.join(root,
    'research/config/ckt-v51-toned-2121-pindu11-uneven786-finalists.json')));
  assert.deepEqual(toneRegions(layouts.contract), [
    {name: 'upper', keys: 'QWERTYP', tones: [4]},
    {name: 'home', keys: 'SDFGHJKL', tones: [3, 2]},
    {name: 'lower', keys: 'ZXCBNM', tones: [1, 5]},
  ]);
});

test('tracked AVUIO _v to M finalist preserves its audited Pareto coordinates', () => {
  const layouts = JSON.parse(fs.readFileSync(path.join(root,
    'research/config/ckt-v51-toned-2121-pindu11-avuio786-rust-trial-finalists.json')));
  const scores = JSON.parse(fs.readFileSync(path.join(root,
    'research/notes/2026-11-10-ckt-v51-toned-2121-pindu11-avuio786-rust-trial-full.json')));
  const layout = layouts.layouts[0];
  assert.deepEqual(layout.trialShengjieException, {atom: '_v', destination: 'M'});
  assert.deepEqual({
    lowerM: layout.memoryAudit.lowerM,
    guard: layout.memoryAudit.conservativeMGuard,
    merge: layout.memoryAudit.toneRegionMergeLower,
    d: layout.memoryAudit.traditionalOnsetD,
    f: layout.memoryAudit.onsetFragmentation,
  }, {lowerM: 30, guard: 35, merge: 12, d: 9, f: 9});
  assert.equal(scores.results[0].id, layout.id);
  assert.ok(Math.abs(scores.results[0].score - 9.556498964188165) < 1e-12);
});
