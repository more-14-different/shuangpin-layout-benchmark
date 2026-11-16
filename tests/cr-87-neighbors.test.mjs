import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
const prefix='research/notes/2026-11-17-cr-87-neighbors';
const read=suffix=>JSON.parse(readFileSync(prefix+suffix,'utf8'));
test('87 representatives pass full native memory, CKT, daily and policy verification',
  {skip:!existsSync(prefix+'-verification.json')},()=>{
    const bundle=read('-finalists.json'),verified=read('-verification.json'),native=read('-native.json');
    assert.equal(verified.centerKey,bundle.sourceContract.pinnedCenterKey);
    assert.ok(verified.centerKey.startsWith('87de6cc69c'));
    assert.equal(verified.publishedHtmlUnchanged,true);
    assert.equal(createHash('sha256').update(readFileSync('a7_CKT_R11.html')).digest('hex'),verified.htmlSha256);
    assert.ok(bundle.newStates<=5000);assert.equal(bundle.budget,5000);
    assert.equal(verified.results.length,bundle.layouts.length);
    for(const layout of bundle.layouts){
      const v=verified.results.find(r=>r.id===layout.id),n=native.results.find(r=>r.id===layout.id);
      assert.ok(Math.abs(n.fixed.score-layout.rustScore)<1e-9);
      assert.ok(Math.abs(v.macro['daily|native-punctuation'].score-layout.metrics.daily)<1e-9);
      assert.deepEqual([n.memory.D,n.memory.F,n.memory.lower,n.memory.guard],
        [layout.metrics.d,0,layout.metrics.m,layout.metrics.guard]);
      assert.deepEqual(n.selected.policy,v.stability.selectedPolicy);
      assert.ok(Math.abs(n.selected.score-v.stability.selectedScore)<1e-9);
    }
  });
