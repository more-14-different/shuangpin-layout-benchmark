'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const scorer=require('./score_completion_ckt_v4'),toned=require('./score_toned_2121_ckt_v51');
const model=require('./ckt_v4_model'),exp=require('./explore_toned_2126');
const native=require('./score_snow_jiandao_toned_benchmark');
const {toneKeysFromShapeKeys}=require('./auxiliary_semantics');
const {marsFirstAtom,marsFirstAtomInitial}=require('./mars_toned_factorization');
const [which,out]=process.argv.slice(2);
assert.ok(['keep','26'].includes(which));
const sourcePath=`research/notes/2026-11-13-toned-2126-regroup-${which}-refine.json`;
const source=JSON.parse(fs.readFileSync(sourcePath));const best=source.results[0],layout=best.layout;
const data=scorer.loadPayload('a7_CKT_R11.html'),snow='D:/C2D/Documents/rime-snow-pinyin';
const words=scorer.multiwords(path.join(snow,'snow_pinyin.base.dict.yaml'),data,.99);
const strokes=scorer.strokeOptions(path.join(snow,'rime-stroke/stroke.dict.yaml'));
const motor=toned.projectedMotor(data),reference=toned.buildReference({data,words,strokes,motor,snow});
const {buildRowsForOrder}=require(path.join(snow,'scripts/research/evaluate_ckt_v4_word_aux_order.js'));
const tone=toneKeysFromShapeKeys(layout.shapeKeysByMeaning);assert.equal(tone,'IEUAO');
const codes=new Map(source.tokenKeys.map((t,i)=>[t,layout.tonedCodes[i]]));
const inventory=JSON.parse(fs.readFileSync('research/config/ckt-v51-toned-2121-seeds.json'));
const decomposition=new Map(inventory.decomposition.map(d=>[d.pinyin,d]));
const id=which==='keep'?'T2126-QEMPTY-8890382':'T2126-FULL26-8871530';
const fixture={layoutId:id,pinyin:data.pinyin,toneKeysByTone:tone,shapeKeysByMeaning:'AEUIO',
  soundKeys:'BCDFGHJKLMNPQRSTVWXYZ',tonedCodes:data.pinyin.map(p=>[1,2,3,4,5].map(t=>codes.get(p+t)||null))};
const atoms=new Map();
data.pinyin.forEach((p,i)=>{if(!fixture.tonedCodes[i].some(Boolean))return;const name=marsFirstAtom(p);if(!atoms.has(name))atoms.set(name,{name,initial:marsFirstAtomInitial(name),pinyin:[]});atoms.get(name).pinyin.push(i);});
fixture.atoms=[...atoms.values()];
fixture.rhymeAtoms=Array.from({length:10},(_,g)=>{
 const finals=Object.keys(layout.finalGroups).filter(f=>layout.finalGroups[f]===g);
 const roots=[...new Set(finals.map(f=>{const d=inventory.decomposition.find(d=>d.fullFinal===f);return d.rhymeBody==='_'?f:d.rhymeBody;}))].sort();
 return {name:roots.join('-'),roots,finals,pinyin:data.pinyin.flatMap((p,i)=>finals.includes(decomposition.get(p)?.fullFinal)?[i]:[])};
});
const adapted=exp.adaptWords(layout,source.tokenKeys,data,words);
const entry={capacity:[21,26],codeList:layout.tonedCodes,tone};
const chars=toned.buildCharacterRows(layout,{tokenKeys:source.tokenKeys},data,tone);
const wr=Object.entries(best.policy).flatMap(([kind,order])=>buildRowsForOrder(entry,data,adapted,'keytao',tone,kind,order,model));
const outcomes=[...model.resolveCompetition(chars,{motorCost:motor}),...model.resolveCompetition(wr,{motorCost:motor,lengthBalance:exp.BALANCE})];
const tracks=Object.fromEntries(['character','word2','word3','word4'].map(k=>[k,reference.summarize(outcomes.filter(o=>o.kind===k))]));
const score=toned.normalizedScore(tracks,reference.tracks);assert.ok(Math.abs(score-best.score)<1e-10);
// v5 keeps its own cognitive formula/reference; native 21x26 routing and selected policy are explicit.
const summary5=model.summarizeOutcomes(outcomes,{...model.DEFAULT_COGNITIVE_PRIOR,pageSize:6});
const ref5=native.v5Reference({data,words,strokes,motor,snow});
const v5=toned.normalizedScore(summary5,ref5);
const occupied=new Set(layout.tonedCodes);
const filterRows=native.filterRows(outcomes,fixture,data,words);
for(const row of filterRows)if(row[5]==='word3'){
 const tokens=row[1].split(' '),last=tokens[2].replace(/0$/,'5');
 row[2]+=codes.get(last)[1];
}
const result={version:'toned-2126-r11-1',id,name:which==='keep'?'21×26 带调 · Q韵空键 9/9/7':'21×26 带调 · 全次键 10/9/7',layoutId:layout.id,
 publication:{research:true,source:sourcePath,rhymeGroups:fixture.rhymeAtoms.map(a=>({roots:a.roots,finals:a.finals})),toneRowsByTone:layout.toneRowsByTone,description:'er→en/n；上二三／中四／下一轻；形辅21/12/24',validation:{anchorsVerified:true,tolerance:1e-10}},
 contract:{main:'tone-in-main 21x26',capacity:[21,26],actual:[21,which==='keep'?25:26],rowCounts:which==='keep'?[9,9,7]:[10,9,7],completion:'shape-only AEUIO',shapeKeysByMeaning:'AEUIO',toneKeysByTone:tone,toneDigitsByShapeMeaning:'42310',wordAuxiliaryPolicy:best.policy,oldR11IndependentToneAuxiliary:false},
 memory:null,
 inventory:{legalTonedSyllables:codes.size,occupiedBuckets:occupied.size,capacity:546,emptyBuckets:546-occupied.size,qzEmpty:!occupied.has('QZ'),zqEmpty:!occupied.has('ZQ')},
 keyboards:{soundKeys:fixture.soundKeys,...native.keyboardSemantics(fixture)},tonedCodes:fixture.tonedCodes,filterRowColumns:['text','readingWithTone0','mainCode','terminalCode','weight','kind'],filterRows,
 ckt:{v5:{score:v5,policy:best.policy,tracks:summary5,reference:'S005 v5; native21x26 routing, 21/12/24'},v51:{score,tracks,policy:best.policy,reference:'S005 shape-only v5.1; AUAU/AAAU/AAAA, joint pools, soft-page-fill-v2'},aggregateV51:native.weightedAggregate(tracks,['motorUpperMs','firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanRejectedCandidates','meanPageActions','meanKeys','effectiveMs'])},ergonomics:native.loadSummary(outcomes)};
result.memory=require('./toned_memory_audit').tonedMemoryAudit(result,data.pinyin,inventory.decomposition);
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({native:result,fixture}));
fs.writeFileSync(out.replace(/\.json$/,'.native.json'),JSON.stringify(result));
console.log(JSON.stringify({id,score,v5,occupied:occupied.size,rows:filterRows.length}));
