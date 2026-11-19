'use strict';
// Isolate each full-corpus replay so Windows does not retain several large motor caches.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const far=require('./anneal_untoned_cr7e_far'),search=require('./search_untoned_cr7e_v52'),{legal}=require('./search_untoned_cr7e_coupled');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function main(){
 const args=process.argv.slice(2),id=args.includes('--entry')?args[args.indexOf('--entry')+1]:null;
 const report=read(far.PREFIX+'.json'),prior=read(path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'));
 assert.ok(report.completed&&report.measuredFinalPolish.completed);
 const template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]};
 if(id){
  const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52');
  const data=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html'));
  const profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
  const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile),row=report.states[id];assert.ok(row);
  const entry=search.rebuild({...template,...row},data),computed=v52.evaluateUntoned(entry,far.POLICY,null,ctx).v52;
  const score=search.normalize(computed,prior.reference),doubledScore=search.normalize(computed,prior.reference,2);
  assert.ok(Math.abs(score-row.score)<1e-9);assert.ok(Math.abs(doubledScore-row.doubledScore)<1e-9);
  const result={...row,capacity:[21,21],tone:entry.tone,codeList:entry.codeList,modes:computed,
   sourceHashes:{[__filename]:hash(__filename),[far.PREFIX+'.json']:hash(far.PREFIX+'.json')}};
  fs.writeFileSync(far.PREFIX+'-replay-'+id+'.json',JSON.stringify(result,null,2)+'\n');console.log(id,score,doubledScore);return;
 }
 for(const[p,h]of Object.entries(report.sourceHashes))assert.equal(hash(p),h,p);
 const values=Object.values(report.states),top=field=>[...values].sort((a,b)=>a[field]-b[field]).slice(0,2);
 const selected=[...new Map([...top('score'),...top('doubledScore')].map(r=>[r.id,r])).values()];
 for(const row of values){assert.deepEqual(row.initialMap,report.initialMap);const e=search.rebuild({...template,...row},prior.auditInput);assert.deepEqual(search.audit(e,prior.auditInput),row.audit);assert.ok(legal(row.audit));}
 const out={reference:prior.reference,auditInput:prior.auditInput,results:[],selectedIds:selected.map(r=>r.id),completed:false};
 for(const row of selected){
  const file=far.PREFIX+'-replay-'+row.id+'.json';
  if(!fs.existsSync(file)){const result=spawnSync(process.execPath,['--expose-gc','--max-old-space-size=4096',__filename,'--entry',row.id],{cwd:ROOT,stdio:'inherit',windowsHide:true});assert.equal(result.status,0,row.id+' replay failed');}
  const replay=read(file);for(const[p,h]of Object.entries(replay.sourceHashes))assert.equal(hash(p),h,p);
  out.results.push(replay);
 }
 out.completed=true;out.sourceHashes={[__filename]:hash(__filename),[far.PREFIX+'.json']:hash(far.PREFIX+'.json')};
 fs.writeFileSync(far.PREFIX+'-verification.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({verified:selected.map(r=>r.id),states:values.length}));
}
if(require.main===module)try{main();}catch(e){console.error(e);process.exitCode=1;}
