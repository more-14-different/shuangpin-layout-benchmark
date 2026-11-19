'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const search=require('./search_untoned_cr7e_v52'),far=require('./anneal_untoned_cr7e_far');
const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model'),{blockErrorMotor}=require('./ckt_block_error');
const {enumerateBounded,optimum}=require('./verify_untoned_cr7e_v52');
const {legal,mappingKey}=require('./search_untoned_cr7e_coupled');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function main(){
 const args=process.argv.slice(2),publication=args.includes('--publication'),id=args.includes('--id')?args[args.indexOf('--id')+1]:null;
 const prior=read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'));
 const report=publication?read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-coupled-v52-verification.json')):read(far.PREFIX+'.json');
 const candidates=publication?report.results:Object.values(report.states);
 const prefix=publication?path.join(ROOT,'research/notes/2026-11-20-u7x-02d-r11'):far.PREFIX;
 if(!publication&&!id)assert.ok(report.completed);
 if(id&&args.includes('--reuse')){
  const row=candidates.find(r=>r.id===id);assert.ok(row);
  const file=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-coupled-v52-policy-'+id.replace('U7F-','U7X-')+'.json');
  if(fs.existsSync(file)){
   const old=read(file);assert.equal(mappingKey(old),mappingKey(row),'cached policy layout differs');
   for(const[p,h]of Object.entries(old.sourceHashes))assert.equal(hash(p),h,p);
   assert.deepEqual(prior.reference,report.reference,'cached S005 reference differs');
   const out={...old,id,reuse:{source:file,sha256:hash(file),reason:'exact same initial/final map, auxiliary mapping, reference and scorer sources; retain complete 144-policy enumeration and canonical replay'},
    sourceHashes:{...old.sourceHashes,[file]:hash(file),[__filename]:hash(__filename)}};
   fs.writeFileSync(prefix+'-policy-'+id+'.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({id,reused:true,one:out.optimal1x,two:out.optimal2x}));return;
  }
 }
 const data=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html'));
 const profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
 const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile),reference=prior.reference;
 const template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 const reset=()=>{ctx.legacy=model.projectedMotor(model.upstreamMotor(ctx.snapshot),ctx.snapshot.keys,data.ckt.calibration.extension_maps);
  ctx.next=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);};
 if(id){
  const row=candidates.find(r=>r.id===id);assert.ok(row,id);const entry=search.rebuild({...template,...row},data),cases={};
  ctx.scorer=scorer;ctx.model=model;ctx.legacy=null;ctx.next=null;if(global.gc)global.gc();
  for(const mode of ['keytao','sanpin']){ctx.motor=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);
   cases[mode]=enumerateBounded(entry,mode,ctx);console.log(id,mode,'144 policies');ctx.motor=null;if(global.gc)global.gc();}
  const out={id,mappingKey:mappingKey(entry),initialMap:entry.initialMap,finalMap:entry.finalMap,capacity:[21,21],tone:entry.tone,codeList:entry.codeList,
   audit:search.audit(entry,data),optimal1x:optimum(cases,reference,1),optimal2x:optimum(cases,reference,2),canonicalReplays:[]};
  const components={id,reference,cases,baselineCostsMs:[300,300,300,600,50,300],coefficients:['firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanRejectedCandidates','meanPageActions']};
  fs.writeFileSync(prefix+'-components-'+id+'.json.gz',zlib.gzipSync(Buffer.from(JSON.stringify(components))));
  const policies=new Map([out.optimal1x,out.optimal2x].map(o=>[JSON.stringify(o.policy),o.policy]));
  for(const policy of policies.values()){
   const parsed=Object.fromEntries(Object.entries(policy).map(([m,s])=>[m,Object.fromEntries(['word2','word3','word4'].map((k,i)=>[k,s.split('/')[i]]))]));
   reset();const computed=v52.evaluateUntoned(entry,parsed,null,ctx),score=search.normalize(computed.v52,reference),doubledScore=search.normalize(computed.v52,reference,2);
   if(JSON.stringify(policy)===JSON.stringify(out.optimal1x.policy))assert.ok(Math.abs(score-out.optimal1x.score)<1e-9);
   if(JSON.stringify(policy)===JSON.stringify(out.optimal2x.policy))assert.ok(Math.abs(doubledScore-out.optimal2x.score)<1e-9);
   out.canonicalReplays.push({policies:parsed,score,doubledScore,modes:computed.v52,v51:computed.v51});if(global.gc)global.gc();
  }
  out.sourceHashes=Object.fromEntries([__filename,profile,path.join(ROOT,'tools/score_ckt_v52.js'),path.join(ROOT,'tools/verify_untoned_cr7e_v52.js')].map(p=>[p,hash(p)]));
  fs.writeFileSync(prefix+'-policy-'+id+'.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({id,one:out.optimal1x,two:out.optimal2x}));return;
 }
 const top=field=>[...candidates].sort((a,b)=>a[field]-b[field]).slice(0,2),selected=[...new Map([...top('score'),...top('doubledScore')].map(r=>[r.id,r])).values()];
 const out={reference,auditInput:prior.auditInput,results:[],selectedIds:selected.map(r=>r.id),completed:false};
 for(const row of candidates){assert.deepEqual(row.initialMap,report.initialMap);const e=search.rebuild({...template,...row},data);assert.deepEqual(search.audit(e,data),row.audit);assert.ok(legal(row.audit));}
 for(const row of selected){reset();const entry=search.rebuild({...template,...row},data),computed=v52.evaluateUntoned(entry,far.POLICY,null,ctx);
  const score=search.normalize(computed.v52,reference),doubledScore=search.normalize(computed.v52,reference,2);assert.ok(Math.abs(score-row.score)<1e-9);assert.ok(Math.abs(doubledScore-row.doubledScore)<1e-9);
  out.results.push({...row,capacity:[21,21],tone:entry.tone,codeList:entry.codeList,modes:computed.v52});console.log(row.id,score,doubledScore);if(global.gc)global.gc();}
 out.completed=true;out.sourceHashes={[__filename]:hash(__filename),[far.PREFIX+'.json']:hash(far.PREFIX+'.json')};
 fs.writeFileSync(prefix+'-verification.json',JSON.stringify(out,null,2)+'\n');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
