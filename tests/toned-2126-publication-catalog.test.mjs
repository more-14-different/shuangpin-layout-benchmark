import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import catalog from '../tools/toned_2126_publication_catalog.js';
import semantics from '../tools/auxiliary_semantics.js';
test('six distinct representatives use their own complete-grid robust policies',()=>{
 const ids=new Set();
 for(const key of Object.keys(catalog.entries)){
  const p=catalog.load(key);assert.ok(!ids.has(p.id));ids.add(p.id);
  const grid=p.robustness.grids.positive50To500;
  assert.equal(grid.points,1000000);assert.equal(grid.policy,p.robustness.selectedPolicy);
  assert.equal(p.source.tokenKeys.length,1407);
  assert.deepEqual(p.best.policy,Object.fromEntries(['word2','word3','word4'].map((k,i)=>[k,grid.policy.split('/')[i]])));
  const ranking=JSON.parse(fs.readFileSync(catalog.rankingPath));assert.equal(ranking.grids.positive50To500.models[p.modelKey].winner.policy,grid.policy);
  assert.equal(p.best.layout.shapeKeysByMeaning,'AEUIO');
  assert.equal(semantics.toneDigitsAtShapeKeys(semantics.toneKeysFromShapeKeys('AEUIO')),'42310');
 }
 assert.equal(ids.size,6);
});
