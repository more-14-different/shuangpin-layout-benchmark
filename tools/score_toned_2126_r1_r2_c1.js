'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {ROOT,entries,load}=require('./toned_2126_r1_r2_c1_catalog');
const model=require('./ckt_v4_model'),toned=require('./score_toned_2121_ckt_v51'),exp=require('./explore_toned_2126');
const native=require('./score_snow_jiandao_toned_benchmark'),v52=require('./score_ckt_v52');
const {toneKeysFromShapeKeys,auxiliarySemantics}=require('./auxiliary_semantics');
const {marsFirstAtom,marsFirstAtomInitial}=require('./mars_toned_factorization');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const main=path.resolve(process.argv[2]||path.join(ROOT,'../shuangpin-layout-benchmark'));
const destination=path.resolve(process.argv[3]||path.join(main,'a7_CKT_R11_integrated_materials/toned2126-r1-r2-c1'));
fs.mkdirSync(destination,{recursive:true});
// Frozen benchmark inputs shared by the independent research verification.
const input=path.join(main,'a7_CKT_R11_integrated_materials/cr_lan_f19/payload-input.json'),data=read(input);
const snow='D:/C2D/Documents/rime-snow-pinyin',profile=path.join(main,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
const ctx=v52.context(data,snow,profile),reference=read(path.join(ROOT,'research/notes/2026-11-18-ckt-v52-all-schemes.json')).references;
const ref5=native.v5Reference({data,words:ctx.words,strokes:ctx.strokes,motor:ctx.legacy,snow});
const inventory=read(path.join(ROOT,'research/config/ckt-v51-toned-2121-seeds.json'));
const decomposition=new Map(inventory.decomposition.map(d=>[d.pinyin,d]));
for(const key of Object.keys(entries)){
 const publication=load(key),{layout,source,id,name,policy}=publication;
 const tone=toneKeysFromShapeKeys(layout.shapeKeysByMeaning);assert.equal(tone,'IEUAO');assert.equal(auxiliarySemantics(tone).shapeKeysByMeaning,'AEUIO');
 const codes=new Map(source.tokenKeys.map((t,i)=>[t,layout.tonedCodes[i]]));
 const fixture={layoutId:id,pinyin:data.pinyin,toneKeysByTone:tone,shapeKeysByMeaning:'AEUIO',soundKeys:'BCDFGHJKLMNPQRSTVWXYZ',
  tonedCodes:data.pinyin.map(p=>[1,2,3,4,5].map(t=>codes.get(p+t)||null))};
 const atoms=new Map();
 data.pinyin.forEach((p,i)=>{if(!fixture.tonedCodes[i].some(Boolean))return;const atom=marsFirstAtom(p);
  if(!atoms.has(atom))atoms.set(atom,{name:atom,initial:marsFirstAtomInitial(atom),pinyin:[]});atoms.get(atom).pinyin.push(i)});
 fixture.atoms=[...atoms.values()];
 fixture.rhymeAtoms=layout.rhymeGroups.map((group,g)=>({...group,name:group.roots.join('-'),pinyin:data.pinyin.flatMap((p,i)=>group.finals.includes(decomposition.get(p)?.fullFinal)?[i]:[])}));
 const chars=toned.buildCharacterRows(layout,source,data,tone),words=exp.adaptWords(layout,source.tokenKeys,data,ctx.words);
 const rows=Object.entries(policy).flatMap(([kind,order])=>ctx.buildRowsForOrder({capacity:[21,26],codeList:layout.tonedCodes,tone},data,words,'keytao',tone,kind,order,model));
 const outcomes=[...model.resolveCompetition(chars,{motorCost:ctx.legacy}),...model.resolveCompetition(rows,{motorCost:ctx.legacy,lengthBalance:exp.BALANCE})];
 const tracks=Object.fromEntries(v52Kinds().map(k=>[k,ctx.summarize(outcomes.filter(o=>o.kind===k))]));
 const score=toned.normalizedScore(tracks,reference.v51.keytao),summary5=model.summarizeOutcomes(outcomes,{...model.DEFAULT_COGNITIVE_PRIOR,pageSize:6});
 const filterRows=native.filterRows(outcomes,fixture,data,ctx.words);
 for(const row of filterRows)if(row[5]==='word3')row[2]+=codes.get(row[1].split(' ')[2].replace(/0$/,'5'))[1];
 const occupied=new Set(layout.tonedCodes);
 const result={version:'toned-2126-r1-r2-c1-r11-v1',id,name,layoutId:layout.id,
  publication:{research:true,source:publication.source,sourceSha256:hash(publication.sourcePath),rhymeGroups:layout.rhymeGroups,toneRowsByTone:layout.toneRowsByTone,
   description:publication.description,policyAudit:{scope:'default-and-uniform-doubled-cognitive-cost-only',policy:layout.policy,selectionTarget:key==='R2'?'double':'default',defaultScore:publication.score,doubleScore:publication.doubleScore,fullPolicies:144,broadRobustnessAudited:false},
   benchmarkComputedForPolicy:policy,validation:{anchorsVerified:true,tolerance:1e-9}},
  contract:{main:'tone-in-main 21x26',capacity:[21,26],actual:[21,26],rowCounts:[10,9,7],completion:'shape-only AEUIO',shapeKeysByMeaning:'AEUIO',toneKeysByTone:tone,toneDigitsByShapeMeaning:'42310',wordAuxiliaryPolicy:policy,oldR11IndependentToneAuxiliary:false},
  memory:null,inventory:{legalTonedSyllables:codes.size,occupiedBuckets:occupied.size,capacity:546,emptyBuckets:546-occupied.size,qzEmpty:!occupied.has('QZ'),zqEmpty:!occupied.has('ZQ')},
  keyboards:{soundKeys:fixture.soundKeys,...native.keyboardSemantics(fixture)},tonedCodes:fixture.tonedCodes,filterRowColumns:['text','readingWithTone0','mainCode','terminalCode','weight','kind'],filterRows,
  ckt:{v5:{score:toned.normalizedScore(summary5,ref5),policy,tracks:summary5,reference:'S005 v5; native21x26 routing, declared fixed policy'},v51:{score,tracks,policy,reference:'S005 shape-only v5.1; AUAU/AAAU/AAAA, joint pools, soft-page-fill-v2'},aggregateV51:native.weightedAggregate(tracks,['motorUpperMs','firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanRejectedCandidates','meanPageActions','meanKeys','effectiveMs'])},
  ergonomics:native.loadSummary(outcomes)};
 result.memory=require('./toned_memory_audit').tonedMemoryAudit(result,data.pinyin,inventory.decomposition);
 assert.equal(result.memory.lower,18);assert.equal(result.memory.guard,21);assert.equal(result.memory.D,2);assert.equal(result.memory.F,0);
 const value=v52.evaluateToned(result,ctx),record={id,name,kind:'tone-in-main',contract:{...result.contract,routes:value.routes,reference:result.ckt.v51.reference},v51:v52.describe(value.v51,{keytao:reference.v51.keytao}),v52:v52.describe(value.v52,{keytao:reference.v52.keytao})};
 assert.ok(Math.abs(record.v52.score-publication.score)<1e-9);
 const doubled=t=>t.motorUpperMs+2*(t.effectiveMs-t.motorUpperMs);
 const doubleScore=10*(v52Kinds().reduce((sum,k,i)=>sum+[1,3,1,1][i]*(doubled(value.v52.keytao[k])/doubled(reference.v52.keytao[k]))**4,0)/6)**.25;
 assert.ok(Math.abs(doubleScore-publication.doubleScore)<1e-9);
 for(const kind of v52Kinds())for(const [letter,load] of Object.entries(layout.ergonomics[kind].load))assert.ok(Math.abs(result.ergonomics.tracks[kind].load[letter]-load)<1e-12);
 result.ckt.v52={score:record.v52.score,policy,tracks:value.v52.keytao,doubleScore,reference:'S005 shape-only v5.2; native21x26 routing'};result.ckt.aggregateV52=record.v52.aggregate;
 fs.writeFileSync(path.join(destination,key+'.json'),JSON.stringify({native:result,fixture,v52Record:record,inputHashes:{payload:hash(input),profile:hash(profile),source:hash(publication.sourcePath)}}));
 fs.writeFileSync(path.join(destination,key+'.native.json'),JSON.stringify(result));
 console.log(JSON.stringify({key,id,v51:score,v52:record.v52.score,doubleScore,rows:filterRows.length,memory:[result.memory.lower,result.memory.guard,result.memory.D]}));
}
function v52Kinds(){return ['character','word2','word3','word4']}
