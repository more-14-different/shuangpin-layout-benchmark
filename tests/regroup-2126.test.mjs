import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import regroup from '../tools/regroup_2126.js';

for (const file of ['qempty-keep', 'qempty-swap', 'alternative-policy-full']) {
  const source = JSON.parse(fs.readFileSync(`research/notes/2026-11-13-toned-2126-${file}.json`));
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
