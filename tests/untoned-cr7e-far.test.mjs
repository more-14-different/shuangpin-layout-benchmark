import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const far=require('../tools/anneal_untoned_cr7e_far');
const {copyCandidate,payloadHash}=require('../tools/finalize_u7x_02d_r11');
const {HEADS,FINALS}=require('../tools/ckt_v4_scheme_fixture');
const {auxiliarySemantics}=require('../tools/auxiliary_semantics');
const prior=JSON.parse(fs.readFileSync(new URL('../research/notes/2026-11-19-untoned-cr7e-v52-verification.json',import.meta.url)));
const seed=prior.results.find(r=>r.id==='U7E-3b1557bb9247');
test('coarse and fine phases cycle with explicit temperatures',()=>{
 assert.equal(far.schedule(0).phase,'coarse');assert.equal(far.schedule(49).phase,'coarse');
 assert.equal(far.schedule(50).phase,'fine');assert.equal(far.schedule(149).phase,'fine');
 assert.deepEqual(far.schedule(0),far.schedule(150));assert.ok(far.schedule(149).temperature<.000251);
});
test('large final perturbations are reproducible and cannot mutate the initial map',()=>{
 const before=JSON.stringify(seed),a={rng:104729},b={rng:104729};
 const one=far.perturb(seed.finalMap,a,12),two=far.perturb(seed.finalMap,b,12);
 assert.deepEqual(one,two);assert.ok(FINALS.filter(f=>one[f]!==seed.finalMap[f]).length>=8);
 assert.equal(JSON.stringify(seed),before);assert.deepEqual(Object.keys(one),FINALS);
 for(const h of HEADS)assert.equal(seed.initialMap[h],prior.results.find(r=>r.id==='U7E-1f46d74c337f').initialMap[h]);
});
test('symbolic templates follow the selected order and preserve reserved-key semantics',()=>{
 const sem=auxiliarySemantics(seed.tone);assert.equal(sem.shapeKeysByMeaning,'AVUIO');assert.equal(sem.toneDigitsByShapeMeaning,'42310');
 const ctx={data:{pinyin:['ba']},words:{word2:[{py:[0,0]}]}};
 const e={initialMap:{...seed.initialMap},finalMap:{...seed.finalMap},codeList:['BL']};
 const rows=[{id:'word2:0',kind:'word2',weight:1,baseLength:4,stages:[{order:0,pool:'word:four',length:4,codes:['BLBL']},{order:1,pool:'word:five',length:5,codes:['BLBLA']}]}];
 const compiled=far.compile(rows,ctx,e);assert.deepEqual(compiled[0][4][0],[0,1,[[0,27,0,27]]]);
 assert.equal(compiled[0][4][1][2][0][4],62);
});
test('candidate transplant copies only exact and prefixed records, preserving existing schemes',()=>{
 const id='U7X-02d505540da0',data={entries:[{id:'old',name:'kept'}],metrics:{old:{score:1}},nested:{values:{'old|S2':3}}};
 const before=payloadHash(data,'old');
 copyCandidate({entries:[{id}],metrics:{[id]:{score:2},old:{score:99}},nested:{values:{[id+'|S2']:4,'old|S2':8}}},data);
 assert.equal(payloadHash(data,'old'),before);assert.equal(data.metrics[id].score,2);assert.equal(data.nested.values[id+'|S2'],4);assert.equal(data.entries.length,1);
});
