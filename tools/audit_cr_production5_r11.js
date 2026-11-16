'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {loadPayload}=require('./score_completion_ckt_v4');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const expected=read('research/config/cr-production5-r11.json').expected,ids=Object.keys(expected);
const before=loadPayload('research/.cache/cr-production5-r11-20261117/before.html');
const after=loadPayload('a7_CKT_R11.html');
const old=before.tonedContractBenchmark.schemes.research,now=after.tonedContractBenchmark.schemes.research;
for(const key of Object.keys(before).filter(k=>k!=='tonedContractBenchmark'))
  assert.equal(hash(after[key]),hash(before[key]),'unrelated payload changed: '+key);
for(const key of Object.keys(before.tonedContractBenchmark).filter(k=>k!=='schemes'))
  assert.equal(hash(after.tonedContractBenchmark[key]),hash(before.tonedContractBenchmark[key]),'unrelated benchmark data: '+key);
for(const key of Object.keys(before.tonedContractBenchmark.schemes).filter(k=>k!=='research'))
  assert.equal(hash(after.tonedContractBenchmark.schemes[key]),hash(before.tonedContractBenchmark.schemes[key]),'unrelated scheme: '+key);
const untouched=Object.keys(old).filter(id=>!ids.includes(id));
for(const id of untouched)assert.equal(hash(now[id]),hash(old[id]),'unrelated research scheme changed: '+id);
assert.equal(Object.keys(now).length,Object.keys(old).length+ids.filter(id=>!old[id]).length);
const audit=read('research/notes/2026-11-17-cr-production5-r11-columns.json').schemes;
for(const id of ids){
  const n=now[id],e=expected[id];assert.ok(n,id);
  assert.ok(Math.abs(n.ckt.v51.score-e.cktV51)<1e-9,id+' CKT');
  assert.ok(Math.abs(n.macro['daily|native-punctuation'].score-e.daily)<1e-9,id+' daily');
  assert.equal(n.memory.lower,e.memoryLower);assert.equal(n.memory.guard,e.memoryGuard);
  assert.deepEqual(n.contract.wordAuxiliaryPolicy,e.wordAuxiliaryPolicy);
  assert.deepEqual(n.columns.completion.adaptation.wordAuxiliaryPolicy,e.wordAuxiliaryPolicy);
  assert.deepEqual(n.publication.policySelection.selectedPolicy,e.wordAuxiliaryPolicy);
  assert.equal(n.publication.policySelection.selected.policy,['word2','word3','word4'].map(k=>e.wordAuxiliaryPolicy[k]).join('/'));
  assert.equal(n.publication.validation.anchorsVerified,true);
  assert.equal(hash(n.columns),hash(audit[id].columns),id+' columns');
  const fixture=read('a7_CKT_R11_integrated_materials/cr_production5/'+id+'.fixture.json');
  assert.equal(hash(n.tonedCodes),hash(fixture.tonedCodes),id+' physical key mapping');
}
const result={version:'cr-production5-preservation-v1',htmlSha256:crypto.createHash('sha256').update(fs.readFileSync('a7_CKT_R11.html')).digest('hex'),
  ordinaryEntries:after.entries.length,untouchedResearch:untouched,updated:ids.filter(id=>old[id]),added:ids.filter(id=>!old[id]),
  researchCount:Object.keys(now).length,payloadPreserved:true,sourceHashes:Object.fromEntries([
    __filename,'research/config/cr-production5-r11.json','research/notes/2026-11-17-cr-production5-r11-columns.json']
    .map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]))};
fs.writeFileSync('research/notes/2026-11-17-cr-production5-r11-preservation.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({ordinary:result.ordinaryEntries,research:result.researchCount,unchanged:untouched.length,
  updated:result.updated,added:result.added}));
