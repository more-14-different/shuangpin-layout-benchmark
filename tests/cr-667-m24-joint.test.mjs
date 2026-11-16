import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import test from 'node:test';
const prefix='research/notes/2026-11-17-cr-667-m24-d2-joint';
const read=s=>JSON.parse(readFileSync(prefix+s,'utf8'));
test('M24 joint representatives retain auxiliary semantics, both native frequency guards and independent memory costs',
  {skip:!existsSync(prefix+'-verification.json')},()=>{
    const b=read('-finalists.json'),n=read('-native.json'),v=read('-verification.json');
    assert.equal(v.htmlUnchanged,true);assert.equal(v.rootInternalSplits,0);
    assert.equal(n.shapeKeysByMeaning,'AVUIO');assert.equal(n.toneKeysByTone,'IVUAO');
    for(const r of b.layouts){
      const actual=n.results.find(x=>x.id===r.id),verified=v.results.find(x=>x.id===r.id),e=actual.fixed.ergonomics;
      assert.ok(Math.abs(actual.fixed.score-r.rustScore)<1e-9);
      assert.ok(Math.abs(verified.macro['daily|native-punctuation'].score-r.metrics.daily)<1e-9);
      assert.deepEqual([actual.memory.lower,actual.memory.guard],[r.metrics.m,r.metrics.guard]);
      assert.ok(actual.memory.lower<=24&&actual.memory.guard<=26);
      assert.equal(actual.memory.D,r.metrics.d);assert.equal(actual.memory.F,0);
      assert.ok(actual.memory.D<=2);assert.equal(b.contract.maxD,2);
      assert.deepEqual(actual.fixed.policy,{word2:'21',word3:'231',word4:'14'});
      for(const [field,key] of [['pinky','leftPinkyQAZPeak4NativeTracks'],['rightPinky','rightPinkyPeak4NativeTracks']])
        assert.ok(Math.abs(e[key].value-r.metrics[field])<1e-9);
      if(r.roles.some(role=>role.startsWith('best_qualified'))){
        assert.ok(e.leftPinkyQAZPeak4NativeTracks.value<=r.constraints.pinkyCeiling+1e-12);
        assert.ok(e.rightPinkyPeak4NativeTracks.value<=r.constraints.rightPinkyCeiling+1e-12);
      }
    }
  });
