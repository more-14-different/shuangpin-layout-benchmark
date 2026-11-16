import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
const require=createRequire(import.meta.url);
function archivedHtmlHash(expected){
  const snapshots=['a7_CKT_R11.html','research/.cache/cr-production5-r11-20261117/before.html'];
  const found=snapshots.find(p=>existsSync(p)&&createHash('sha256').update(readFileSync(p)).digest('hex')===expected);
  assert.ok(found,'Missing original HTML snapshot for archived verification '+expected);
  return createHash('sha256').update(readFileSync(found)).digest('hex');
}
for(const [prefix,count] of [
  ['research/notes/2026-11-16-cr-stable-neighbors',3],
  ['research/notes/2026-11-16-cr-balanced-followup',1]]){
const read=suffix=>JSON.parse(readFileSync(prefix+suffix,'utf8'));
const available=existsSync(prefix+'-finalists.json')&&existsSync(prefix+'-verification.json');

test(prefix+': representatives retain independently derived five-key semantics and memory budgets',
  {skip:!available},()=>{
    const bundle=read('-finalists.json');
    const pinyin=[...new Set(bundle.tokenKeys.map(t=>t.replace(/[1-5]$/,'')))];
    const decomposition=require('../research/config/ckt-v51-toned-2121-seeds.json').decomposition;
    const {tonedMemoryAudit}=require('../tools/toned_memory_audit');
    const {toneKeysFromShapeKeys,shapeKeysFromToneKeys}=require('../tools/auxiliary_semantics');
    assert.equal(toneKeysFromShapeKeys('AVUIO'),'IVUAO');
    assert.equal(shapeKeysFromToneKeys('IVUAO'),'AVUIO');
    assert.equal(bundle.layouts.length,count);
    for(const layout of bundle.layouts){
      const codes=new Map(bundle.tokenKeys.map((t,i)=>[t,layout.tonedCodes[i]]));
      const m=tonedMemoryAudit({publication:{rhymeGroups:layout.rhymeGroups},
        tonedCodes:pinyin.map(py=>[1,2,3,4,5].map(t=>codes.get(py+t)||null))},pinyin,decomposition);
      assert.deepEqual([m.lower,m.guard],[layout.metrics.m,layout.metrics.guard]);
      assert.equal(m.F,0);assert.ok(m.D<=2&&m.lower<=layout.constraints.maxM&&m.guard<=24);
      assert.ok(layout.metrics.ckt<=layout.before.ckt+1e-9);
      assert.ok(layout.metrics.daily>=layout.constraints.dailyFloor-1e-9);
      assert.ok(layout.metrics.pinky<=layout.constraints.pinkyCeiling+1e-12);
    }
  });

test(prefix+': archived scored states and full JS checks match the policy-specific search winners',
  {skip:!available},()=>{
    const bundle=read('-finalists.json'),verified=read('-verification.json');
    assert.equal(verified.publishedHtmlUnchanged,true);
    assert.equal(archivedHtmlHash(verified.htmlSha256),verified.htmlSha256);
    const bytes=readFileSync(prefix+'-scores.json.gz');
    assert.equal(createHash('sha256').update(bytes).digest('hex'),bundle.scoreArchive.sha256);
    const caches=JSON.parse(gunzipSync(bytes));
    const aux=read('-auxiliary.json');
    for(const layout of bundle.layouts){
      const cached=caches[layout.parent][layout.key];
      assert.deepEqual(bundle.contracts[layout.parent].wordAuxiliaryPolicy,layout.wordAuxiliaryPolicy);
      const anchor=caches[layout.parent][layout.anchorKey];
      assert.equal(anchor.metrics.verified,true);
      for(const field of ['ckt','daily','pinky'])assert.ok(Math.abs(anchor.metrics[field]-layout.before[field])<1e-9);
      assert.deepEqual(cached.state,layout.state);assert.equal(cached.metrics.verified,true);
      assert.equal(Object.keys(caches[layout.parent]).length,layout.uniqueScoredLayouts);
      const row=aux.results.find(r=>r.id===layout.id);
      assert.equal(row.policyCount,144);assert.equal(row.cohortEqualityVerified,true);
      assert.deepEqual(row.baseline.policy,layout.wordAuxiliaryPolicy);
      assert.ok(Math.abs(row.baselineVerified.score-layout.rustScore)<1e-9);
      const v=verified.results.find(r=>r.id===layout.id);
      assert.ok(Math.abs(v.fixed.score-layout.rustScore)<1e-9);
      assert.deepEqual(v.selected.policy,v.selectedPolicy);
      assert.ok(Math.abs(v.selected.score-v.selectedScore)<1e-9);
      assert.ok(Math.abs(v.macro['daily|native-punctuation'].score-layout.metrics.daily)<1e-9);
    }
  });
}
