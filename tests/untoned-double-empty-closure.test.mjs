import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

test('checkpoint binds every layout key and rejects a different score contract',()=>{
  const {layoutKey,validateCheckpoint}=require('../tools/close_untoned_2126_double_empty.js');
  const a={capacity:[21,26],tone:'IEUAO',initialMap:{b:'B'},finalMap:{a:'A'}};
  assert.equal(layoutKey(a),layoutKey({...a,id:'different label'}));
  assert.notEqual(layoutKey(a),layoutKey({...a,tone:'IAUEO'}));
  assert.notEqual(layoutKey(a),layoutKey({...a,finalMap:{a:'Z'}}));
  assert.throws(()=>validateCheckpoint({fingerprint:'old',version:1},'new'),/contract/);
  assert.doesNotThrow(()=>validateCheckpoint({fingerprint:'same',version:1},'same'));
});

test('complete neighborhood includes single-token moves and group moves without duplicate states',()=>{
  const {enumerateNeighborhood,layoutKey}=require('../tools/close_untoned_2126_double_empty.js');
  const {HEADS,FINALS}=require('../tools/ckt_v4_scheme_fixture.js');
  const e={capacity:[21,26],tone:'IEUAO',initialMap:Object.fromEntries(HEADS.map(h=>[h,'B'])),finalMap:Object.fromEntries(FINALS.map(f=>[f,'A']))};
  const rows=enumerateNeighborhood(e);
  assert.equal(new Set(rows.map(layoutKey)).size,rows.length);
  assert.ok(rows.some(r=>r.finalMap.iu==='Z'&&r.finalMap.in==='A'));
  assert.ok(rows.some(r=>FINALS.every(f=>r.finalMap[f]==='Z')));
  assert.ok(!rows.some(r=>layoutKey(r)===layoutKey(e)));
});

test('resume finishes an open predecessor even when a better successor was already audited',()=>{
  const {resumeCenter}=require('../tools/close_untoned_2126_double_empty.js');
  const seed={id:'seed',score:9.1};
  const checkpoint={seed,records:{a:seed,b:{id:'better',score:9.0,independentPass:true}},centers:[{id:'seed',completed:false}]};
  assert.equal(resumeCenter(checkpoint).id,'seed');
  checkpoint.centers[0]={id:'seed',completed:true,nextId:'better'};
  assert.equal(resumeCenter(checkpoint).id,'better');
});

test('contract sources bind auxiliary semantics, mapping parser, and independent gates',()=>{
  const {contractSourceFiles}=require('../tools/close_untoned_2126_double_empty.js');
  const paths=contractSourceFiles({snow:'D:/snow',html:'D:/a.html',fixture:'D:/f.json',seed:'D:/s.json'}).map(p=>p.replaceAll('\\','/'));
  for(const suffix of ['tools/auxiliary_semantics.js','tools/ckt_v4_scheme_fixture.js','scripts/research/auxiliary_semantics.js','R11_integrated_replay/script1.js','R11_integrated_replay/script2.js','R11_integrated_replay/track_options.json','R11_integrated_replay/memory_r2.py','R11_integrated_replay/audit.py'])
    assert.ok(paths.some(p=>p.endsWith(suffix)),suffix);
});
