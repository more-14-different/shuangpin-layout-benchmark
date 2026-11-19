import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{auxiliarySemantics,toneKeysFromShapeKeys}=require('../tools/auxiliary_semantics');
const {packFilterRows}=require('../tools/recent_cr_r11');
const {nativeRows}=require('../tools/score_ckt_v52');
const prefix='research/notes/2026-11-19-recent-cr-r11';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const audit=read(prefix+'-columns.json'),source=read(prefix+'-source.json'),verified=read(prefix+'-verification.json');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

test('complete published values retain native tasks and semantic round trips',()=>{
  assert.equal(audit.ids.length,8);assert.equal(new Set(audit.ids).size,8);
  for(const id of audit.ids){const n=audit.schemes[id],original=source.layouts.find(r=>r.id===id);
    const semantics=auxiliarySemantics(n.contract.toneKeysByTone);
    assert.equal(semantics.shapeKeysByMeaning,n.contract.shapeKeysByMeaning);
    assert.equal(toneKeysFromShapeKeys(semantics.shapeKeysByMeaning),n.contract.toneKeysByTone);
    assert.equal(semantics.toneDigitsByShapeMeaning,'42310');
    assert.deepEqual(n.ckt.v51.policy,n.ckt.v52.policy);assert.deepEqual(n.contract.wordAuxiliaryPolicy,original.wordAuxiliaryPolicy);
    assert.ok(Math.abs(n.ckt.v52.score-original.recentRefinement.expectedV52)<1e-9);
    for(const k of ['character','word2','word3','word4']){
      assert.equal(n.ckt.v51.tracks[k].count,n.ckt.v52.tracks[k].count);
      assert.equal(n.ckt.v51.tracks[k].selectionRate,n.ckt.v52.tracks[k].selectionRate);
      assert.ok(Math.abs(n.ckt.v52.tracks[k].effectiveMs-original.recentRefinement.expectedTracksV52[k].effectiveMs)<1e-7);
    }
  }
});

test('representatives have genuine tradeoffs on named axes and omit superseded 9f',()=>{
  assert.equal(audit.noRepresentativeDominatedOnNamedAxes,true);
  assert.ok(!audit.ids.some(id=>id.endsWith('9f0408d0e5')));
  for(const b of audit.rows)for(const a of audit.rows)if(a!==b){
    const dominated=audit.representativeParetoAxes.every(k=>a[k]<=b[k]+1e-12)&&audit.representativeParetoAxes.some(k=>a[k]<b[k]-1e-12);
    assert.equal(dominated,false,b.id+' dominated by '+a.id);
  }
});

test('minimax policy panel does not route into historical mean-rank schema',()=>{
  const scope={esc:String,num:(x,n)=>Number(x).toFixed(n),pct:x=>(100*x).toFixed(4)+'%',uxTable:()=>'<table></table>',snowJiandaoPolicyPanel:()=>'<old-policy>'};
  vm.createContext(scope);vm.runInContext(fs.readFileSync('tools/recent_cr_r11_ui.js','utf8'),scope);
  for(const id of audit.ids){const html=scope.snowJiandaoPolicyPanel(audit.schemes[id]);
    assert.match(html,/最大损失/);assert.match(html,/data-doubled-v52/);assert.match(html,new RegExp(audit.schemes[id].ckt.v52.score.toFixed(9)));
    assert.doesNotMatch(html,/平均排名|综合第二名/);
  }
  assert.equal(scope.snowJiandaoPolicyPanel({publication:{}}),'<old-policy>');
});

test('source archives and prior atlas preservation evidence are intact',()=>{
  for(const doc of [source,audit,verified])for(const [p,expected] of Object.entries(doc.sourceHashes))assert.equal(hash(p),expected,p);
  assert.equal(verified.otherPayloadFieldsUnchanged,true);assert.equal(verified.oldResearchUnchanged,21);assert.equal(verified.oldV52SchemesUnchanged,33);
});

test('shared wire rows round-trip without changing text, reading, weight or terminal codes',()=>{
  const pool=[['甲乙','jia3yi3',123,'word2'],['甲','jia3',456,'character']];
  const data={tonedFilterRowPool:{version:1,rows:pool}},original=[['甲','jia3','AA','AAU',456,'character'],['甲乙','jia3yi3','ABCD','ABCDV',123,'word2']];
  const n={filterRows:structuredClone(original)},index=new Map(pool.map((r,i)=>[JSON.stringify(r),i]));
  packFilterRows(n,data,index);assert.equal(n.filterRows,undefined);assert.deepEqual([...nativeRows(n,data)],original);
  assert.deepEqual(data.tonedFilterRowPool.rows,pool);
  assert.throws(()=>packFilterRows({filterRows:[['陌生','mo4sheng1','AB','AB',1,'word2']]},data,index),/absent from frozen shared pool/);
});
