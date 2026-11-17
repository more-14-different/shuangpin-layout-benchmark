'use strict';
// Check the generated payload against both the full score audit and its input.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const scorer=require('./score_completion_ckt_v4');
const dir='a7_CKT_R11_integrated_materials/cr_lan_f19',id='CR-LAN-f19a0ad1dc';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fileHash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const html='a7_CKT_R11.html',before=read(dir+'/payload-input.json'),after=scorer.loadPayload(html);
const preserved={};
for(const key of Object.keys(before)){
  if(key==='tonedContractBenchmark')continue;
  assert.equal(digest(after[key]),digest(before[key]),'changed payload field '+key);
  preserved[key]=digest(after[key]);
}
const oldContract=before.tonedContractBenchmark,newContract=after.tonedContractBenchmark;
for(const key of Object.keys(oldContract))if(key!=='schemes')
  assert.equal(digest(newContract[key]),digest(oldContract[key]),'changed toned contract field '+key);
for(const key of Object.keys(oldContract.schemes))if(key!=='research')
  assert.equal(digest(newContract.schemes[key]),digest(oldContract.schemes[key]),'changed toned family '+key);
const preservedResearch={};
for(const [key,value] of Object.entries(oldContract.schemes.research))if(key!==id){
  assert.equal(digest(newContract.schemes.research[key]),digest(value),'changed research scheme '+key);
  preservedResearch[key]=digest(value);
}
const n=newContract.schemes.research[id],auditPath='research/notes/2026-11-17-cr-lan-f19-r11-columns.json';
const audit=read(auditPath).schemes[id],fixture=read(dir+'/'+id+'.fixture.json');
assert.equal(digest(Object.fromEntries(Object.entries(n).filter(([k])=>!['filterRows','tonedCodes','keyboards'].includes(k)))),digest(audit));
assert.deepEqual(n.tonedCodes,fixture.tonedCodes);
assert.equal(n.filterRows.length,6233+132814+72923+77674);
assert.deepEqual(n.contract.wordAuxiliaryPolicy,{word2:'21',word3:'213',word4:'14'});
assert.deepEqual([n.memory.lower,n.memory.guard,n.memory.D,n.memory.F],[24,25,2,0]);
const manifest=read(dir+'/manifest.json');assert.equal(manifest.htmlSha256,fileHash(html));
const result={version:'cr-lan-f19-r11-verification-v1',id,htmlSha256:fileHash(html),
  auditSha256:fileHash(auditPath),fixtureSha256:fileHash(dir+'/'+id+'.fixture.json'),
  wordAuxiliaryPolicy:n.contract.wordAuxiliaryPolicy,cktV51:n.ckt.v51.score,
  daily:n.macro['daily|native-punctuation'].score,filterRows:n.filterRows.length,
  memory:n.memory,preservedPayloadFields:preserved,preservedResearch,
  otherSchemesUnchanged:true};
fs.writeFileSync('research/notes/2026-11-17-cr-lan-f19-r11-verification.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({id,ckt:result.cktV51,preservedResearch:Object.keys(preservedResearch).length,otherSchemesUnchanged:true}));
