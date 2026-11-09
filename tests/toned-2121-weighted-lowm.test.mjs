import assert from 'node:assert/strict';
import test from 'node:test';
import weighted from '../tools/analyze_toned_2121_weighted_components.js';
import pairs from '../tools/search_toned_2121_weighted_lowm_pairs.js';

test('partial i/u/v grammar counts symmetric nasal rotation as one rule', () => {
  assert.equal(weighted.offsetRuleCount(0, 0, 0), 0);
  assert.equal(weighted.offsetRuleCount(-1, 1, 0), 1);
  assert.equal(weighted.offsetRuleCount(-1, 0, 2), 2);
  assert.equal(weighted.offsetRuleCount(-1, -1, 2), 3);
});

test('pair compatibility rejects overlapping initial/shengjie domains', () => {
  const inventory = {decomposition: [
    {initial: 'd', shengjie: 'd', rhymeBody: 'a', fullFinal: 'a'},
    {initial: 'd', shengjie: 'di', rhymeBody: 'an', fullFinal: 'ian'},
  ]};
  assert.equal(pairs.compatible(
    {property: 'initial', family: 'd'},
    {property: 'shengjie', family: 'di'}, inventory), false);
  assert.equal(pairs.compatible(
    {property: 'shengjie', family: 'di'},
    {property: 'fullFinal', family: 'a'}, inventory), true);
});

test('pair compatibility rejects overlapping rhyme-body/full-final domains', () => {
  const inventory = {decomposition: [
    {initial: 'j', shengjie: 'ji', rhymeBody: 'an', fullFinal: 'ian'},
  ]};
  assert.equal(pairs.compatible(
    {property: 'rhymeBody', family: 'an'},
    {property: 'fullFinal', family: 'ian'}, inventory), false);
});
