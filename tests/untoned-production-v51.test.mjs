import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {audit,rebuild,legal,decodeState,movingHand}=require('../tools/search_untoned_production_v51.js');
const {auxiliarySemantics}=require('../tools/auxiliary_semantics.js');
const {ALPHABET,HEADS,FINALS}=require('../tools/ckt_v4_scheme_fixture.js');
const root=path.resolve(import.meta.dirname,'..');
const html=path.join(root,'a7_CKT_R11.html');
const fixture=path.join(root,'research/.cache/ckt-v4-ergonomics.json');
const available=fs.existsSync(html)&&fs.existsSync(fixture);

test('Common399 empty-bucket and memory guard reject regressions',()=>{
  const b={audit:{M:40,D:3,V:1,branches:0,unique:399}};
  const ok={valid:true,M:40,D:3,V:1,branches:0,unique:399,qz:false,zq:false};
  assert.equal(legal({audit:ok},b),true);
  for(const delta of [{M:41},{D:4},{V:2},{branches:1},{unique:398},{qz:true},{zq:true},{valid:false}])
    assert.equal(legal({audit:{...ok,...delta}},b),false,JSON.stringify(delta));
});

test('production mappings round-trip state, Common399, M-R2 and auxiliary semantics',{skip:!available},()=>{
  const data=require('../tools/score_completion_ckt_v4.js').loadPayload(html);
  const ergo=JSON.parse(fs.readFileSync(fixture,'utf8'));
  for(const [id,M,D,V,shape,tone] of [
    ['QZ-e8f37a0998f9',42,2,5,'AVUIO','IVUAO'],
    ['SNOW-SHENYUN-21X26-D3V1-BALANCED',40,3,1,'AEUIO','IEUAO'],
  ]) {
    const e=data.entries.find(e=>e.id===id);
    const rebuilt=rebuild(e,data);
    for(const [p] of data.base)assert.equal(rebuilt.codeList[p],e.codeList[p],data.pinyin[p]);
    const a=audit(rebuilt,data);
    assert.deepEqual([a.M,a.D,a.V,a.qz,a.zq],[M,D,V,false,false]);
    assert.equal(a.unique,e.memoryAuditR2.unique);
    const semantic=auxiliarySemantics(e.tone);
    assert.equal(semantic.shapeKeysByMeaning,shape);
    assert.equal(semantic.toneKeysByTone,tone);
    assert.equal(semantic.toneDigitsByShapeMeaning,'42310');
    const bytes=[...e.capacity,...HEADS.map(h=>ALPHABET.indexOf(e.initialMap[h])),...FINALS.map(f=>ALPHABET.indexOf(e.finalMap[f])),...[...e.tone].map(k=>ALPHABET.indexOf(k))];
    const decoded=rebuild(decodeState(Buffer.from(bytes).toString('hex'),e),data);
    for(const [p] of data.base)assert.equal(decoded.codeList[p],e.codeList[p]);
    const mx=movingHand(decoded,data,ergo.movingHand);
    assert.equal(mx.hits,2149);
    assert.ok(Math.abs(mx.score-data['macroxue'].values[id]['daily|native-punctuation'].score)<1e-9);
  }
});
