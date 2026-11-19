import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url);
const {normalize,neighbors,audit}=require('../tools/search_untoned_cr7e_v52');
const {FINALS}=require('../tools/ckt_v4_scheme_fixture');
const {optimum,enumerateBounded}=require('../tools/verify_untoned_cr7e_v52');
const scorer=require('../tools/score_completion_ckt_v4');
const model=require('../tools/ckt_v4_model');
test('doubling cognitive costs reprices the same reference, preserving S005=10',()=>{
 const track={motorUpperMs:100,effectiveMs:180};
 const modes=Object.fromEntries(['keytao','sanpin'].map(m=>[m,Object.fromEntries(['character','word2','word3','word4'].map(k=>[k,{...track}]))]));
 assert.equal(normalize(modes,modes,1),10);assert.equal(normalize(modes,modes,2),10);
 const candidate=structuredClone(modes);for(const m of Object.values(candidate))for(const t of Object.values(m))t.effectiveMs=190;
 assert.ok(Math.abs(normalize(candidate,modes,2)-10*280/260)<1e-12);
});
test('all neighborhood moves preserve the fixed initials and source final table',()=>{
 const finalMap=Object.fromEntries(FINALS.map((f,i)=>[f,'BCDEFGHJKLMNPQRSTWXYZ'[i%21]]));
 const entry={initialMap:{zh:'E',ch:'S',sh:'K',s:'C'},finalMap};
 const snapshot=JSON.stringify(entry),rows=neighbors(entry);
 assert.ok(rows.length>1000);assert.equal(JSON.stringify(entry),snapshot);
 for(const r of rows){assert.equal(r.initialMap,undefined);assert.equal(Object.keys(r.finalMap).length,35);}
});
test('incomplete Common399 data cannot masquerade as a legal candidate',()=>{
 assert.deepEqual(audit({codeList:[null]},{base:[[0,1]],pinyin:['ba']}),{valid:false});
});
test('policy comparison selects one complete policy per member at each cost setting',()=>{
 const tracks=(motor,cognitive)=>Object.fromEntries(['character','word2','word3','word4'].map(k=>[k,{motorUpperMs:motor,effectiveMs:motor+cognitive}]));
 const references={keytao:tracks(100,100),sanpin:tracks(100,100)};
 const cases=Object.fromEntries(['keytao','sanpin'].map(m=>[m,{results:[
  {policyKey:'motor-first',tracks:tracks(80,110)},
  {policyKey:'cognitive-first',tracks:tracks(120,80)},
 ]}]));
 assert.deepEqual(optimum(cases,references,1).policy,{keytao:'motor-first',sanpin:'motor-first'});
 assert.deepEqual(optimum(cases,references,2).policy,{keytao:'cognitive-first',sanpin:'cognitive-first'});
});
test('bounded policy enumeration preserves the shared word2/word4 competition pool',()=>{
 const original=scorer.buildRows;
 const row=(id,kind,weight,code)=>({id,text:id,kind,weight,baseLength:code.length,
  stages:[{length:code.length,order:code.length,pool:kind==='character'?'character':kind==='word3'?'word3':'word2+word4',codes:[code]}]});
 scorer.buildRows=()=>[row('char','character',1,'XY')];
 try{
  const pairs=n=>{const out=[];for(let a=1;a<=n;a++)for(let b=1;b<=n;b++)if(a!==b)out.push(''+a+b);return out;};
  const ctx={data:{},strokes:{},words:{},orderedDistinctPairs:pairs,permutations:()=>['123','132','213','231','312','321'],
   motor:code=>({upperMs:10*code.length}),summarize:out=>Object.values(model.summarizeOutcomes(out)).find(Boolean),
   buildRowsForOrder:(e,d,w,m,t,kind)=>[row(kind,kind,kind==='word2'?2:1,'ABCD')],
   buildExtendedWord3Rows:()=>[row('word3','word3',1,'ABC')]};
  const result=enumerateBounded({tone:'IVUAO'},'keytao',ctx);
  assert.equal(result.results.length,144);assert.equal(new Set(result.results.map(r=>r.policyKey)).size,144);
  for(const r of result.results){assert.equal(r.tracks.word2.selectionRate,0);assert.equal(r.tracks.word4.selectionRate,1);assert.equal(r.tracks.word3.selectionRate,0);}
 }finally{scorer.buildRows=original;}
});
