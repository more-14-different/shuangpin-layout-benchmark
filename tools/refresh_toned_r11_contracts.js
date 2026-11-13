'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {loadPayload}=require('./score_completion_ckt_v4');
const {tonedMemoryAudit}=require('./toned_memory_audit');
const root=path.resolve(__dirname,'..'),htmlPath=path.join(root,'a7_CKT_R11.html');
const destination=path.join(root,'a7_CKT_R11_integrated_materials/toned-contract-audit');
const decomposition=require('../research/config/ckt-v51-toned-2121-seeds.json').decomposition;
const mode=process.argv[2];if(!['prepare','publish'].includes(mode))throw new Error('expected prepare or publish');
fs.mkdirSync(destination,{recursive:true});
const data=loadPayload(htmlPath),bridge=data.tonedContractBenchmark;
const natives=[bridge.schemes.snowJiandao,...Object.values(bridge.schemes.research||{})];
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
const audit={version:'tone-in-main-contract-audit-v3',schemes:{}};
for(const native of natives){
  const memory=tonedMemoryAudit(native,data.pinyin,decomposition);
  if(native.contract.capacity?.[1]!==26&&(memory.lower!==native.memory.lower||memory.guard!==native.memory.guard))throw new Error(native.id+': memory anchor mismatch');
  native.memory=memory;
  for(const names of Object.values(native.keyboards.firstByKey))for(let at=0;at<names.length;at++)if(/^[wy]$/i.test(names[at]))names[at]='zero-'+names[at].toUpperCase();
  const nativePath=path.join(destination,native.id+'.native.json');
  if(mode==='prepare'){
    write(nativePath,Object.fromEntries(Object.entries(native).filter(([key])=>!['filterRows','columns','macro'].includes(key))));
    continue;
  }
  const columns=JSON.parse(fs.readFileSync(path.join(destination,native.id+'.columns.json'),'utf8'));
  const hash=require('node:crypto').createHash('sha256').update(JSON.stringify(native.tonedCodes)).digest('hex');
  if(columns.version!=='tone-in-main-column-contracts-v3'||columns.nativeId!==native.id||columns.tonedCodesSha256!==hash)throw new Error(native.id+': stale columns');
  if(columns.sound.suffixAlphabet!==native.contract.toneKeysByTone ||
    JSON.stringify(columns.completion.adaptation.wordAuxiliaryPolicy)!==JSON.stringify(native.contract.wordAuxiliaryPolicy) ||
    columns.completion.adaptation.word3BaseLength!==((native.contract.capacity?.[1]||21)===21?3:4))throw new Error(native.id+': stale contract metadata');
  columns.collision=native.columns.collision;native.columns=columns;
  audit.schemes[native.id]=Object.fromEntries(Object.entries(native).filter(([key])=>!['tonedCodes','filterRows','keyboards'].includes(key)));
  console.log(JSON.stringify({id:native.id,M:[memory.lower,memory.guard],cktV51:native.ckt.v51.score,
    completionV3word3Base:columns.completion.adaptation.word3BaseLength,fixedCharacter:columns.completion.independent.fixedV1.keytao.character.completionUpperMs}));
}
if(mode==='prepare'){
  write(path.join(destination,'manifest.json'),{ids:natives.map(native=>native.id)});
}else{
  write(path.join(root,'research/notes/2026-11-14-toned-contract-audit.json'),audit);
  const cr=Object.fromEntries(Object.entries(audit.schemes).filter(([id])=>id.startsWith('CR')));
  const wide=Object.fromEntries(Object.entries(audit.schemes).filter(([id])=>id.startsWith('T2126')));
  write(path.join(root,'research/notes/2026-11-13-cr-frontier-r11-columns.json'),{version:'cr-frontier-r11-v2',schemes:cr});
  write(path.join(root,'research/notes/2026-11-14-toned-2126-r11-benchmark.json'),{version:2,schemes:wide});
  write(path.join(destination,'snow_jiandao_toned_benchmark.json'),bridge);
  const html=fs.readFileSync(htmlPath,'utf8'),tag=html.indexOf('<script id="payload"'),start=html.indexOf('>',tag)+1,end=html.indexOf('</script>',start);
  const compressed=zlib.gzipSync(JSON.stringify(data),{mtime:0}).toString('base64');
  const temporary=htmlPath+'.tmp';fs.writeFileSync(temporary,html.slice(0,start)+compressed+html.slice(end));fs.renameSync(temporary,htmlPath);
}
