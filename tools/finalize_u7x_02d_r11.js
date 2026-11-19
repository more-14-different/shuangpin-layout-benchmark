'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model');
const {blockErrorMotor}=require('./ckt_block_error'),{auxiliarySemantics}=require('./auxiliary_semantics');
const {normalize,REF}=require('./search_untoned_cr7e_v52');
const ROOT=path.resolve(__dirname,'..'),ID='U7X-02d505540da0',PREFIX=path.join(ROOT,'research/notes/2026-11-20-u7x-02d-r11');
const TARGET='D:/C2D/Desktop/Code/Lua/inputMethod/shuangpin-layout-benchmark/a7_CKT_R11.html';
const PATCH=path.join(ROOT,'research/.cache/untoned-cr7e-far-v52-20261120/u7x-candidate-patch.json');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function copyCandidate(source,target,id=ID){
 for(const[k,v]of Object.entries(source)){
  if(k===id||k.startsWith(id+'|'))target[k]=structuredClone(v);
  else if(v&&typeof v==='object'&&!Array.isArray(v)&&target[k]&&typeof target[k]==='object'&&!Array.isArray(target[k]))copyCandidate(v,target[k],id);
 }
}
function schemeHashes(data,ids){
 const wanted=new Set(ids),records=new Map(ids.map(id=>[id,{}]));
 for(const entry of data.entries)if(wanted.has(entry.id))records.get(entry.id).entry=entry;
 function visit(v,p=[]){if(!v||typeof v!=='object')return;if(Array.isArray(v))return;
  for(const[k,x]of Object.entries(v)){const id=wanted.has(k)?k:k.includes('|')?k.slice(0,k.indexOf('|')):null;
   if(wanted.has(id))records.get(id)[[...p,k].join('.')]=x;else visit(x,[...p,k]);}}
 visit(data);return Object.fromEntries([...records].map(([id,record])=>[id,hash(JSON.stringify(record))]));
}
function payloadHash(data,id){return schemeHashes(data,[id])[id];}
async function main(){
 if(process.argv.includes('--extract')){
  const stage=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html')),tree={entries:[stage.entries.find(e=>e.id===ID)]};assert.ok(tree.entries[0]);
  function extract(source){const out={};for(const[k,v]of Object.entries(source)){
   if(k===ID||k.startsWith(ID+'|'))out[k]=v;
   else if(v&&typeof v==='object'&&!Array.isArray(v)){const child=extract(v);if(Object.keys(child).length)out[k]=child;}}
   return out;}
  Object.assign(tree,extract(stage));fs.writeFileSync(PATCH,JSON.stringify(tree));console.log('extracted candidate records');return;
 }
 const robust=read(PREFIX+'-robustness.json');assert.ok(robust.completed);
 const policy=read(PREFIX+'-policy-'+ID+'.json');
 const stage=read(PATCH);
 const entry=stage.entries.find(e=>e.id===ID);assert.ok(entry,'complete native column replay first');
 console.log('loading target HTML');
 const before=fs.readFileSync(TARGET),beforeHash=hash(before),data=scorer.loadPayload(TARGET);
 const backup=path.join(ROOT,'research/.cache/untoned-cr7e-far-v52-20261120/main-before-u7x.html');
 if(!fs.existsSync(backup))fs.writeFileSync(backup,before);
 console.log('checking existing scheme records');
 const existingIds=data.entries.filter(e=>e.id!==ID).map(e=>e.id),preserved=schemeHashes(data,existingIds);
 const policies=Object.fromEntries(Object.entries(robust.selectedPolicies).map(([m,s])=>[m,Object.fromEntries(['word2','word3','word4'].map((k,i)=>[k,s.split('/')[i]]))]));
 const profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
 console.log('replaying S005 and candidate');
 const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile);
 const reference=v52.evaluateUntoned(data.entries.find(e=>e.id==='S005'),REF,null,ctx);
 ctx.legacy=model.projectedMotor(model.upstreamMotor(ctx.snapshot),ctx.snapshot.keys,data.ckt.calibration.extension_maps);
 ctx.next=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);
 const computed=v52.evaluateUntoned(entry,policies,null,ctx);
 const described={v51:v52.describe(computed.v51,reference.v51),v52:v52.describe(computed.v52,reference.v52)};
 if(JSON.stringify(robust.selectedPolicies)===JSON.stringify(policy.optimal1x.policy))assert.ok(Math.abs(described.v52.score-policy.optimal1x.score)<1e-9,'publication reference differs from audited reference');
 const p=entry.productionCandidateMetrics;
 entry.name='冰雪神韵·QZ/ZQ 空桶·综合速度候选 U7X-02d · v5.2稳健辅序';
 entry.notes=entry.notes.filter(s=>!s.includes('399/399 唯一'));
 entry.notes.push('Common399 覆盖399，唯一主码348；沿用e1声母，U7E韵母组合改良。');
 entry.notes.push('v5.2生产辅序由50%–500%六项独立认知成本的百万场景平均名次选定；100%–1000%网格另作复核。');
 Object.assign(p,{replayedCktV51:described.v51.score,cktV51Aggregate:described.v51.aggregate,
  cktV51Policies:{candidate:policies,reference:REF},replayedCktV52:described.v52.score,
  cktV52Aggregate:described.v52.aggregate,cktV52Modes:computed.v52,cktV52Policies:{candidate:policies,reference:REF},
  productionMetricVersion:'v52',productionMetricContract:'CKT v5.2; robust six-cost mean-rank auxiliary policies; character/word2/word3/word4=1:3:1:1; two members equally weighted',
  cktV52AuxOrderSelection:{criterion:robust.criterion,scenarios:robust.scenariosPerGrid,report:path.relative(ROOT,PREFIX+'-robustness.json').replaceAll('\\','/'),selectedPolicies:robust.selectedPolicies},
  cktV52CostDoubled:normalize(computed.v52,reference.v52,2),cktV52DefaultPointOptimal:policy.optimal1x,cktV52DoubledPointOptimal:policy.optimal2x});
 Object.assign(entry.readmeBenchmarkMetrics,{cktV51:described.v51.score,cktV52:described.v52.score});
 for(const[k,v]of Object.entries(described.v52.aggregate))entry.readmeBenchmarkMetrics['aggregate'+k[0].toUpperCase()+k.slice(1)]=v;
 console.log('merging candidate records');copyCandidate(stage,data);
 const at=data.entries.findIndex(e=>e.id===ID);if(at>=0)data.entries[at]=entry;else data.entries.push(entry);
 const count=data.entries.length;data.finalSelection.currentCatalogueCount=count;data.r11Research.counts.current=count;
 for(const name of ['ensemble','ensembleV2','ensembleV3','ensembleV4','ensembleV5'])if('scoreCoverage'in data[name])data[name].scoreCoverage=count;
 data.fourCodeCollisionBenchmark.catalogueCount=count;
 data.bPathBenchmark.schemeCount=data.entries.filter(e=>Object.keys(e.bPathMetricsNative||{}).length===8).length;
 const record={id:ID,name:entry.name,kind:'untoned',contract:{capacity:[21,21],auxiliarySemantics:auxiliarySemantics(entry.tone),policies:{candidate:policies,reference:REF},lengthBalance:null,routes:computed.routes,reference:'S005 each mode separately'},...described};
 data.cktV52.schemes[ID]=record;
 data.cktV52.counts.untoned=Object.values(data.cktV52.schemes).filter(r=>r.kind!=='tone-in-main').length;
 data.cktV52.counts.total=Object.keys(data.cktV52.schemes).length;
 (data.cktV52.extensions??=[]).push({id:ID,source:path.relative(ROOT,PREFIX+'-publication.json').replaceAll('\\','/'),score:described.v52.score});
 assert.deepEqual(schemeHashes(data,existingIds),preserved,'existing scheme changed');
 let html=before.toString('utf8');const start=html.indexOf('>',html.indexOf('<script id="payload"'))+1,end=html.indexOf('</script>',start);assert.ok(start>0&&end>start);
 console.log('packing updated page');const packed=zlib.gzipSync(Buffer.from(JSON.stringify(data)),{level:6}).toString('base64');html=html.slice(0,start)+packed+html.slice(end);
 const old="production.cktV51Aggregate[field]";
 const replacement="production[production.productionMetricVersion==='v52'?'cktV52Aggregate':'cktV51Aggregate'][field]";
 if(html.includes(old))html=html.replaceAll(old,replacement);
 // Explain the target row without changing the historical production-column contract.
 const note=`<script id="u7x-02d-production-note">\nUG.u7x02dProduction={title:'U7X-02d · v5.2稳健生产辅序',brief:'形${robust.selectedPolicies.keytao}；调${robust.selectedPolicies.sanpin}',detail:'本方案生产属性按v5.2稳健辅序复算；旧方案沿用各自原发布合同。六项认知成本独立扰动，S005在同一参数下同步计价。',direction:'同合同越低越好'};\n</script>\n`;
 html=html.replace(/<script id="u7x-02d-production-note">[\s\S]*?<\/script>\s*/u,'');const bodyEnd=html.lastIndexOf('</body>');html=html.slice(0,bodyEnd)+note+html.slice(bodyEnd);
 assert.equal(hash(fs.readFileSync(TARGET)),beforeHash,'target HTML changed during scoring');
 const staged=TARGET+'.u7x.tmp';fs.writeFileSync(staged,html);fs.renameSync(staged,TARGET);
 console.log('checking written page');const check=scorer.loadPayload(TARGET);assert.equal(check.entries.filter(e=>e.id===ID).length,1);
 assert.deepEqual(schemeHashes(check,existingIds),preserved);
 const audit={version:'u7x-02d-r11-publication-1',id:ID,html:TARGET,htmlBeforeSha256:beforeHash,htmlAfterSha256:hash(fs.readFileSync(TARGET)),
  preservedExistingSchemes:existingIds.length,catalogue:count,policies,score:described.v52.score,doubledScore:p.cktV52CostDoubled,
  metrics:entry.readmeBenchmarkMetrics,semantics:auxiliarySemantics(entry.tone),memory:entry.memoryAuditR2.M,
  sourceHashes:Object.fromEntries([__filename,PREFIX+'-columns.json',PREFIX+'-robustness.json',PREFIX+'-policy-'+ID+'.json'].map(f=>[f,hash(fs.readFileSync(f))]))};
 fs.writeFileSync(PREFIX+'-publication.json',JSON.stringify(audit,null,2)+'\n');console.log(JSON.stringify(audit));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={copyCandidate,payloadHash,schemeHashes};
