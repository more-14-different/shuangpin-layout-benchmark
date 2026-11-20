'use strict';
// Independently rebuild original row/stage routing and M-T1 for local finalists.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const exp=require('./explore_toned_2126'),toned=require('./score_toned_2121_ckt_v51');
const model=require('./ckt_v4_model'),native=require('./score_snow_jiandao_toned_benchmark');
const {context}=require('./score_ckt_v52'),{toneKeysFromShapeKeys,auxiliarySemantics}=require('./auxiliary_semantics');
const {tonedMemoryAudit}=require('./toned_memory_audit');
const prefix=process.argv[2]||'research/notes/2026-11-19-toned-2126-v52-m4-refine';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>require('node:crypto').createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function main(){
 const bundle=read(prefix+'-finalists.json'),search=read(prefix+'.json');assert.equal(search.complete,true);
 const audit=JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync(prefix+'-policies.json.gz')));
 const checks=[...bundle.layouts];
 for(const a of audit.results)for(const best of [a.bestDefault,a.bestDouble]){
  if(checks.some(l=>l.id===a.id&&JSON.stringify(l.policy)===JSON.stringify(best.policy)))continue;
  const source=bundle.layouts.find(l=>l.id===a.id),value=a.policies.find(v=>JSON.stringify(v.state.policy)===JSON.stringify(best.policy));
  checks.push({...source,policy:best.policy,score:value.score,doubleScore:value.doubleScore,tracks:value.tracks,ergonomics:value.ergonomics});
 }
 const main=path.resolve('../shuangpin-layout-benchmark'),snow='D:/C2D/Documents/rime-snow-pinyin';
 const payload=path.join(main,'a7_CKT_R11_integrated_materials/cr_lan_f19/payload-input.json');
 const profile=path.join(main,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
 const data=read(payload),ctx=context(data,snow,profile),summarize=ctx.summarize;
 const reference=read('research/notes/2026-11-18-ckt-v52-all-schemes.json').references.v52.keytao;
 const inv=read('research/config/ckt-v51-toned-2121-seeds.json'),results=[];
 const close=(a,b,label,tol=1e-7)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<tol,label+': '+a+' vs '+b);
 for(const layout of checks){
  const tone=toneKeysFromShapeKeys(layout.shapeKeysByMeaning);assert.equal(tone,'IEUAO');
  assert.equal(auxiliarySemantics(tone).shapeKeysByMeaning,'AEUIO');
  layout.tonedCodes.forEach(code=>assert.ok("BCDFGHJKLMNPQRSTVWXYZ".includes(code[0])));
  assert.equal(new Set(layout.tonedCodes.map(c=>c[0])).size,21);
  const occupied=[new Set(),new Set(),new Set()],physicalRows=['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'];
  bundle.tokenKeys.forEach((token,i)=>{
   const row=layout.toneRowsByTone[token.slice(-1)],key=layout.tonedCodes[i][1];
   assert.ok(physicalRows[row].includes(key),'tone row '+token);occupied[row].add(key);
  });
  assert.deepEqual(occupied.map(s=>s.size),[10,9,7]);
  const policy=Object.fromEntries(['word2','word3','word4'].map((k,i)=>[k,layout.policy[i]]));
  const chars=toned.buildCharacterRows(layout,bundle,data,tone);
  const words=exp.adaptWords(layout,bundle.tokenKeys,data,ctx.words);
  const entry={capacity:[21,26],codeList:layout.tonedCodes,tone};
  const rows=Object.entries(policy).flatMap(([kind,order])=>ctx.buildRowsForOrder(entry,data,words,'keytao',tone,kind,order,model));
  const outcomes=[...model.resolveCompetition(chars,{motorCost:ctx.next}),...model.resolveCompetition(rows,{motorCost:ctx.next,lengthBalance:exp.BALANCE})];
  const tracks=Object.fromEntries(['character','word2','word3','word4'].map(k=>[k,summarize(outcomes.filter(o=>o.kind===k))]));
  const score=toned.normalizedScore(tracks,reference);close(score,layout.score,layout.id+' CKT',1e-9);
  let power=0;for(const [i,k] of ['character','word2','word3','word4'].entries()){
   const doubled=t=>t.motorUpperMs+2*(t.effectiveMs-t.motorUpperMs);
   power+=[1,3,1,1][i]*(doubled(tracks[k])/doubled(reference[k]))**4;
   for(const f of Object.keys(layout.tracks[k]))close(tracks[k][f],layout.tracks[k][f],layout.id+'/'+k+'/'+f);
  }
  const doubleScore=10*(power/6)**.25;close(doubleScore,layout.doubleScore,'double cost',1e-9);
  const ergonomics=native.loadSummary(outcomes);
  for(const k of ['character','word2','word3','word4'])for(const [key,value] of Object.entries(layout.ergonomics[k].load))close(ergonomics.tracks[k].load[key],value,'load '+k+key,1e-12);
  for(const k of ['character','word2','word3','word4'])close(ergonomics.tracks[k].differentKeySameFingerRate,layout.ergonomics[k].differentKeySameFingerRate,'same finger '+k,1e-12);
  assert.ok(ergonomics.leftPinkyQAZPeak4NativeTracks.value<=search.contract.leftPinkyMaximum+1e-12);
  const byToken=new Map(bundle.tokenKeys.map((t,i)=>[t,layout.tonedCodes[i]]));
  const memory=tonedMemoryAudit({publication:{rhymeGroups:layout.rhymeGroups,toneRowsByTone:layout.toneRowsByTone},tonedCodes:data.pinyin.map(p=>[1,2,3,4,5].map(t=>byToken.get(p+t)||null))},data.pinyin,inv.decomposition);
  assert.equal(memory.lower,layout.memoryLower);assert.equal(memory.guard,layout.memoryGuard);
  assert.equal(memory.D,layout.D);assert.ok(memory.D<=search.contract.Dmaximum);assert.equal(memory.F,0);
  assert.ok(memory.lower<=search.contract.MlowerMaximum&&memory.guard<=search.contract.MguardMaximum);
  if(search.contract.fixedInitialMap){
   const {marsFirstAtom}=require('./mars_toned_factorization');
   for(let i=0;i<bundle.tokenKeys.length;i++){
    const atom=marsFirstAtom(bundle.tokenKeys[i].slice(0,-1));
    const name=atom.startsWith('zero-')?atom.slice(-1):atom;
    assert.equal(layout.tonedCodes[i][0],search.contract.fixedInitialMap[name],'frozen onset '+bundle.tokenKeys[i]);
   }
  }
  results.push({id:layout.id,originRoutes:layout.originRoutes,policy,score,doubleScore,tracks,ergonomics,memory});
  console.log(JSON.stringify({id:layout.id,score,doubleScore,leftPinky:ergonomics.leftPinkyQAZPeak4NativeTracks.value}));
 }
 const sources=[__filename,prefix+'.json',prefix+'-finalists.json',prefix+'-policies.json.gz','research/config/toned-2126-v52-onset-atoms.json','tools/search_toned_2126_v52_onsets.py','tools/search_toned_2126_v52_m19.py','tools/refine_toned_2126_v52_m4.py','tools/audit_toned_2126_v52_m4_policies.py','tools/report_toned_2126_v52_m4.py','tools/toned_2126_v52_load_kernel.py','tools/ckt_v4_model.js','tools/explore_toned_2126.js','tools/score_ckt_v52.js','tools/toned_memory_audit.js',payload,profile,path.join(snow,'snow_pinyin.base.dict.yaml')];
 sources.push(...(search.extraSourcePaths||[]));
 const scoresIndex=prefix+'-scores-index.json';
 if(fs.existsSync(scoresIndex))sources.push(scoresIndex,'tools/toned_2126_v52_score_archives.py',...read(scoresIndex).parts.map(p=>p.file));
 fs.writeFileSync(prefix+'-verification.json',JSON.stringify({version:1,sourceHashes:Object.fromEntries(sources.map(p=>[path.resolve(p).replaceAll('\\','/'),hash(p)])),results},null,2)+'\n');
}
if(require.main===module)main();
