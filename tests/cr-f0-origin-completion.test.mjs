import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import test from 'node:test';
const prefix='research/notes/2026-11-17-cr-f0-origin-completion';
const read=suffix=>JSON.parse(readFileSync(prefix+suffix,'utf8'));
test('the pinned f0 winner has a full JS score and five-key memory audit',
  {skip:!existsSync(prefix+'-native.json')},()=>{
    const bundle=read('-finalists.json'),native=read('-native.json');
    const layout=bundle.layouts[0],v=native.results[0];
    assert.equal(native.mode,'fixed-policy-only');assert.equal(layout.id,v.id);
    assert.deepEqual(v.fixed.policy,{word2:'21',word3:'231',word4:'14'});
    assert.ok(Math.abs(v.fixed.score-layout.rustScore)<1e-9);
    assert.ok(Math.abs(v.fixed.ergonomics.leftPinkyQAZPeak4NativeTracks.value-layout.metrics.pinky)<1e-9);
    assert.ok(v.fixed.ergonomics.leftPinkyQAZPeak4NativeTracks.value<=layout.constraints.pinkyCeiling+1e-12);
    assert.deepEqual([v.memory.D,v.memory.F,v.memory.lower,v.memory.guard],
      [layout.metrics.d,0,layout.metrics.m,layout.metrics.guard]);
  });
