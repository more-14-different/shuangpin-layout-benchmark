'use strict';
// Independent full competitions, M-T1 derivation, and selected-code load checks.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const native=require('./score_toned_2121_ckt_v51'),corpus=require('./score_completion_ckt_v4'),model=require('./ckt_v4_model');
const {blockErrorMotor}=require('./ckt_block_error'),{tonedMemoryAudit}=require('./toned_memory_audit');
const {auxiliarySemantics}=require('./auxiliary_semantics');
const prefix='research/notes/2026-11-19-f19-v52-production-audit',read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function main(){
  const bundle=read(prefix+'-candidates.json'),audit=read(prefix+'-robustness.json'),ergo=read(prefix+'-ergonomics.json');
  const enumeration=JSON.parse(zlib.gunzipSync(fs.readFileSync(prefix+'-policies.json.gz')));
  const data=read('a7_CKT_R11_integrated_materials/cr_lan_f19/payload-input.json');
  const snow='D:/C2D/Documents/rime-snow-pinyin',words=corpus.multiwords(path.join(snow,'snow_pinyin.base.dict.yaml'),data,.99);
  const motor=model.projectedMotor(blockErrorMotor(read('tools/ckt_v4_upstream_role_tables.json'),
    read('research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json')),'ABCDEFGHIJKLMNOPQRSTUVWXYZ;,./',data.ckt.calibration.extension_maps);
  const reference={tracks:enumeration.reference.tracks,summarize:require(path.join(snow,'scripts/research/evaluate_ckt51_aux_order.js')).summarize};
  const decomposition=read('research/config/ckt-v51-toned-2121-seeds.json').decomposition;
  const pys=[...new Set(bundle.tokenKeys.map(t=>t.replace(/[1-5]$/,'')))];
  const production=read(path.join(snow,'config/snow-jiandao-toned-mapping.json'));
  assert.equal(auxiliarySemantics(production.toneKeysByTone).shapeKeysByMeaning,production.shapeKeysByMeaning);
  const splitByPinyin=new Map(decomposition.map(r=>[r.pinyin,r]));
  const productionLayout=bundle.layouts.find(r=>r.id==='current-production');
  const {marsFirstAtom}=require('./mars_toned_factorization');
  bundle.tokenKeys.forEach((token,i)=>{
    const py=token.slice(0,-1),tone=Number(token.at(-1));
    const group=production.rhymeGroups.find(g=>g.finals.includes(splitByPinyin.get(py).fullFinal));
    assert.ok(group,'production final missing '+py);
    const actual=production.firstKeys[marsFirstAtom(py)]+group.keys[production.toneRegions[tone]];
    assert.equal(actual,productionLayout.tonedCodes[i],'current production mapping changed '+token);
  });
  const checks=new Map(),key=p=>['word2','word3','word4'].map(k=>p[k]).join('/');
  function add(id,policy){checks.set(id+'#'+key(policy),{id,policy})}
  for(const id of ['f19a0ad1dc','2eb6eb060e','current-production'])add(id,audit.results.find(r=>r.id===id).selected.policy);
  for(const g of Object.values(audit.crossLayoutComparisons))for(const mode of ['fixedPolicies','adaptiveRivals'])
    for(const s of Object.values(g[mode]))add(s.worstCase.rivalId,s.worstCase.rivalPolicy);
  const close=(a,b,label,tol=1e-7)=>{if(!Number.isFinite(a)||Math.abs(a-b)>tol)throw Error(label+': '+a+' != '+b)};
  const memories=[];
  for(const layout of bundle.layouts){
    const codes=new Map(bundle.tokenKeys.map((t,i)=>[t,layout.tonedCodes[i]]));
    const memory=tonedMemoryAudit({publication:{rhymeGroups:layout.id==='current-production'?production.rhymeGroups:layout.rhymeGroups},
      tonedCodes:pys.map(py=>[1,2,3,4,5].map(t=>codes.get(py+t)||null))},pys,decomposition);
    memories.push({id:layout.id,...memory});
  }
  const results=[];
  for(const check of checks.values()){
    const layout=bundle.layouts.find(r=>r.id===check.id),row=enumeration.results.find(r=>r.id===check.id).policies.find(r=>key(r.policy)===key(check.policy));
    const value=native.evaluateLayoutPolicy({layout,layouts:bundle,data,words,motor,reference,shapeKeysByMeaning:'AVUIO',policy:check.policy});
    close(value.score,row.score,check.id+' score',1e-9);
    for(const kind of ['character','word2','word3','word4'])for(const field of ['motorUpperMs','effectiveMs','firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanRejectedCandidates','meanPageActions','meanKeys'])
      close(value.tracks[kind][field],row.tracks[kind][field],check.id+'/'+kind+'/'+field);
    const actual=require('./score_snow_jiandao_toned_benchmark').loadSummary(value.outcomes);
    const recorded=ergo.results.find(r=>r.id===check.id);
    if(key(recorded.policy)===key(check.policy))for(const kind of ['character','word2','word3','word4']){
      for(const field of ['home','leftPinkyQAZ','rightPinky','maxFinger','differentKeySameFingerRate'])close(actual.tracks[kind][field],recorded.tracks[kind][field],check.id+'/'+kind+'/'+field,1e-12);
      for(const k of Object.keys(recorded.tracks[kind].load))close(actual.tracks[kind].load[k],recorded.tracks[kind].load[k],check.id+'/'+kind+'/'+k,1e-12);
    }
    results.push({id:check.id,policy:check.policy,score:value.score,tracks:value.tracks,ergonomics:actual});
    console.log(JSON.stringify({id:check.id,policy:check.policy,score:value.score}));
  }
  const inputs=[__filename,'tools/score_toned_2121_ckt_v51.js','tools/score_completion_ckt_v4.js',
    'tools/ckt_v4_model.js','tools/ckt_block_error.js','tools/toned_memory_audit.js',
    'tools/enumerate_f19_v52_policies.py','tools/audit_f19_v52_robustness.py','tools/f19_v52_ergonomics.py',
    'tools/export_f19_v52_policy_templates.js','tools/ckt_v4_upstream_role_tables.json',
    'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json',
    'a7_CKT_R11_integrated_materials/cr_lan_f19/payload-input.json',
    path.join(snow,'snow_pinyin.base.dict.yaml'),path.join(snow,'config/snow-jiandao-toned-mapping.json'),
    prefix+'-candidates.json',prefix+'-policies.json.gz',prefix+'-robustness.json'];
  const sourceHashes=Object.fromEntries(inputs.map(p=>[path.resolve(p).replaceAll('\\','/'),crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
  fs.writeFileSync(prefix+'-verification.json',JSON.stringify({version:'f19-v52-full-native-verification-v1',sourceHashes,memories,results},null,2)+'\n');
}
if(require.main===module)main();
