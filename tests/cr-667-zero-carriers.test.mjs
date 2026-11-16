import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
const prefix='research/notes/2026-11-17-cr-667-zero-carriers';
const read=suffix=>JSON.parse(readFileSync(prefix+suffix,'utf8'));
test('zero-carrier representatives pass independent native scoring with derived M and original auxiliary semantics',
  {skip:!existsSync(prefix+'-verification.json')},()=>{
    const b=read('-finalists.json'),v=read('-verification.json'),n=read('-native.json');
    assert.equal(v.rootInternalSplits,0);assert.equal(v.htmlUnchanged,true);
    assert.equal(createHash('sha256').update(readFileSync('a7_CKT_R11.html')).digest('hex'),v.htmlSha256);
    assert.equal(n.shapeKeysByMeaning,'AVUIO');assert.equal(n.toneKeysByTone,'IVUAO');
    assert.equal(b.contract.memoryModel,'M-T1-derived-carrier-associations-v1');
    for(const layout of b.layouts){
      const row=v.results.find(r=>r.id===layout.id),actual=n.results.find(r=>r.id===layout.id);
      assert.ok(Math.abs(row.score-layout.rustScore)<1e-9);
      assert.ok(Math.abs(row.macro['daily|native-punctuation'].score-layout.metrics.daily)<1e-9);
      assert.deepEqual(actual.fixed.policy,{word2:'21',word3:'231',word4:'14'});
      assert.equal(actual.memory.D,layout.metrics.d);assert.equal(actual.memory.F,0);
      assert.deepEqual([actual.memory.lower,actual.memory.guard],[layout.metrics.m,layout.metrics.guard]);
      assert.ok(actual.memory.lower<=22&&actual.memory.guard<=24);
      const fits=actual.fixed.ergonomics.leftPinkyQAZPeak4NativeTracks.value<=layout.constraints.pinkyCeiling+1e-12;
      assert.equal(fits,layout.constraintsSatisfied);
      assert.ok(fits||layout.diagnosticOnly);
    }
  });
