'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {loadPayload}=require('./score_completion_ckt_v4');
const {auxiliarySemantics}=require('./auxiliary_semantics');
const {tonedMemoryAudit}=require('./toned_memory_audit');
const {nativeRows}=require('./score_ckt_v52');
const ROOT=path.resolve(__dirname,'..'),DIR=path.join(ROOT,'a7_CKT_R11_integrated_materials/recent_cr_v52');
const PREFIX=path.join(ROOT,'research/notes/2026-11-19-recent-cr-r11');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fileHash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const close=(a,b,label,tol=1e-9)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=tol,label);

function preservation(data){
  const out={top:{},toned:{},research:{},v52:{}};
  for(const [key,value] of Object.entries(data))if(!['tonedContractBenchmark','cktV52'].includes(key))out.top[key]=digest(value);
  for(const [key,value] of Object.entries(data.tonedContractBenchmark))if(key!=='schemes')out.toned[key]=digest(value);
  for(const [key,value] of Object.entries(data.tonedContractBenchmark.schemes))if(key!=='research')out.toned['scheme:'+key]=digest(value);
  for(const [key,value] of Object.entries(data.tonedContractBenchmark.schemes.research))out.research[key]=digest(value);
  for(const [key,value] of Object.entries(data.cktV52.schemes))out.v52[key]=digest(value);
  out.v52Definition=digest(data.cktV52.definition);out.v52References=digest(data.cktV52.references);
  return out;
}

function main(){
  const manifest=read(path.join(DIR,'manifest.json')),audit=read(PREFIX+'-columns.json');
  const before=preservation(loadPayload(path.join(DIR,'before.html'))),data=loadPayload(path.join(ROOT,'a7_CKT_R11.html'));
  const after=preservation(data);assert.deepEqual(after.top,before.top);assert.deepEqual(after.toned,before.toned);
  for(const family of ['research','v52'])for(const [key,hash] of Object.entries(before[family]))if(!manifest.ids.includes(key))assert.equal(after[family][key],hash,'old '+family+' '+key);
  assert.equal(after.v52Definition,before.v52Definition);assert.equal(after.v52References,before.v52References);
  assert.equal(Object.keys(after.research).length,Object.keys(before.research).length+manifest.newIds.length);
  assert.equal(Object.keys(after.v52).length,Object.keys(before.v52).length+manifest.newIds.length);
  assert.equal(data.cktV52.counts.total,Object.keys(data.cktV52.schemes).length);
  const decomposition=read(path.join(ROOT,'research/config/ckt-v51-toned-2121-seeds.json')).decomposition;
  for(const id of manifest.ids){
    const n=data.tonedContractBenchmark.schemes.research[id],expected=audit.schemes[id],record=data.cktV52.schemes[id];
    assert.equal(digest(Object.fromEntries(Object.entries(n).filter(([k])=>!['filterRows','filterRowsPacked','tonedCodes','keyboards'].includes(k)))),digest(expected));
    const memory=tonedMemoryAudit(n,data.pinyin,decomposition);
    assert.deepEqual([n.memory.lower,n.memory.guard,n.memory.D,n.memory.F],[memory.lower,memory.guard,memory.D,memory.F]);
    assert.deepEqual(auxiliarySemantics(n.contract.toneKeysByTone).shapeKeysByMeaning,n.contract.shapeKeysByMeaning);
    assert.equal(n.filterRowsPacked.version,1);assert.equal(n.filterRowsPacked.rows.length,6233+132814+72923+77674);
    let count=0;for(const row of nativeRows(n,data)){assert.equal(row.length,6);count++}assert.equal(count,n.filterRowsPacked.rows.length);
    assert.deepEqual(n.contract.wordAuxiliaryPolicy,n.ckt.v51.policy);assert.deepEqual(n.ckt.v52.policy,n.ckt.v51.policy);
    assert.deepEqual(n.columns.completion.adaptation.wordAuxiliaryPolicy,n.ckt.v51.policy);
    close(record.v52.score,n.ckt.v52.score,id+' v52 table adapter');close(record.v51.score,n.ckt.v51.score,id+' v51 adapter');
    for(const k of ['character','word2','word3','word4']){
      close(record.v52.modes.keytao[k].effectiveMs,n.ckt.v52.tracks[k].effectiveMs,id+' track '+k);
      for(const field of ['firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanKeys'])close(n.ckt.v51.tracks[k][field],n.ckt.v52.tracks[k][field],id+' unchanged task '+k+'/'+field);
    }
    for(const version of ['v1','v2','fixedV1','fixedV2','v3'])for(const mode of ['keytao','sanpin']){
      assert.ok(n.columns.completion.independent[version][mode]);
    }
    for(const version of ['v3','v4','v5'])assert.ok(Number.isFinite(n.columns.ensemble[version]),id+' ensemble '+version);
    assert.ok(n.columns.collision);assert.ok(n.macro['daily|native-punctuation']);
  }
  const result={version:'recent-cr-r11-verification-v1',ids:manifest.ids,otherPayloadFieldsUnchanged:true,
    oldResearchUnchanged:Object.keys(before.research).filter(id=>!manifest.ids.includes(id)).length,
    oldV52SchemesUnchanged:Object.keys(before.v52).filter(id=>!manifest.ids.includes(id)).length,
    newSchemes:manifest.ids.length,allMemoryAndAuxiliaryMappingsVerified:true,allVersionSpecificColumnsPresent:true,
    htmlSha256:fileHash(path.join(ROOT,'a7_CKT_R11.html')),auditSha256:fileHash(PREFIX+'-columns.json'),
    sourceHashes:Object.fromEntries([__filename,path.join(ROOT,'tools/recent_cr_r11.js'),path.join(ROOT,'tools/recent_cr_r11_ui.js')].map(p=>[path.relative(ROOT,p).replaceAll('\\','/'),fileHash(p)]))};
  assert.equal(result.htmlSha256,manifest.htmlAfterSha256);
  fs.writeFileSync(PREFIX+'-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
if(require.main===module)main();
module.exports={preservation};
