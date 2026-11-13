import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import regroup from '../tools/regroup_2126.js';
import coupled from '../tools/coupled_regroup_2126.js';

for (const file of ['qempty-keep', 'qempty-swap', 'alternative-policy-full']) {
  const source = JSON.parse(fs.readFileSync(`research/notes/2026-11-13-toned-2126-${file}.json`));
  test(`${file}: coupled swap follows tone 2/3 and leaves other rows untouched`, () => {
    const before = JSON.stringify(source);
    const original = source.results[0].layout;
    const swapped = coupled.variant(source, true).results[0].layout;
    const row = original.toneRowsByTone[2];
    assert.equal(swapped.regionMaps[row][1], original.regionMaps[row][9]);
    assert.equal(swapped.regionMaps[row][9], original.regionMaps[row][1]);
    for (let r = 0; r < 3; r++) for (let g = 0; g < 10; g++)
      if (r !== row || ![1, 9].includes(g)) assert.equal(swapped.regionMaps[r][g], original.regionMaps[r][g]);
    for (let er = 0; er < 10; er++) for (let v = 0; v < 10; v++) {
      const s = coupled.variant(source, true);
      regroup.verify(s, regroup.makeLayout(s, er, v));
    }
    assert.equal(JSON.stringify(source), before);
  });
  test(`${file}: all 100 regroupings preserve first keys, tone rows, nonempty groups and physical coverage`, () => {
    assert.deepEqual(regroup.makeLayout(source, 7, 3).tonedCodes, source.results[0].layout.tonedCodes);
    for (let er = 0; er < 10; er++) for (let v = 0; v < 10; v++) {
      const layout = regroup.makeLayout(source, er, v);
      regroup.verify(source, layout);
      assert.equal(layout.finalGroups.er, er);
      assert.equal(layout.finalGroups.v, v);
      assert.equal(layout.finalGroups.ve, 2);
      assert.equal(layout.finalGroups.vn, 1);
      assert.equal(layout.finalGroups.van, 4);
      assert.equal(layout.shapeKeysByMeaning, 'AEUIO');
    }
  });
}
