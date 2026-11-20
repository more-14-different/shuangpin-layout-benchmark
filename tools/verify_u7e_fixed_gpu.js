'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52'),model=require('./ckt_v4_model'),search=require('./search_untoned_cr7e_v52');
const {blockErrorMotor}=require('./ckt_block_error'),{policyObjects}=require('./finalize_untoned_frontiers_r11');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function main(){
 const folder=path.resolve(process.argv[2]||'research/.cache/u7e-fixed-gpu-smoke-v2-20261120');
 const cfgPath=path.join(ROOT,'research/config/u7e-fixed-gpu.json'),cfg=read(cfgPath),frontier=read(path.join(folder,'frontier.json'));
 const html='D:/C2D/Desktop/Code/Lua/inputMethod/shuangpin-layout-benchmark/a7_CKT_R11.html',data=scorer.loadPayload(html),template=data.entries.find(r=>r.id===cfg.seedId);
 const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',path.join(ROOT,cfg.profile));
 const reference=v52.evaluateUntoned(data.entries.find(r=>r.id==='S005'),search.REF,null,ctx).v52;
 const rows=[...new Map(Object.values(frontier.frontiers).flat().filter(r=>r.modes).map(r=>[r.id,r])).values()].slice(0,3);
 assert.equal(rows.length,3,'smoke must contain three independently generated states');
 const results=[];
 for(const row of rows){
  const finalMap=Object.fromEntries(cfg.finalNames.map((name,i)=>[name,String.fromCharCode(65+row.finals[i])]));
  const entry=search.rebuild({...template,id:row.id,initialMap:cfg.initialMap,finalMap},data),audit=search.audit(entry,data);
  assert.ok(audit.valid&&audit.M===41&&audit.D===2&&!audit.qz&&!audit.zq);assert.deepEqual(audit.actual,[21,21]);
  ctx.legacy=model.projectedMotor(model.upstreamMotor(ctx.snapshot),ctx.snapshot.keys,data.ckt.calibration.extension_maps);
  ctx.next=model.projectedMotor(blockErrorMotor(ctx.snapshot,ctx.profile),ctx.snapshot.keys,data.ckt.calibration.extension_maps);
  const computed=v52.evaluateUntoned(entry,cfg.policies,null,ctx).v52;
  let maxTrackDifference=0;
  for(const mode of ['keytao','sanpin'])for(const kind of ['character','word2','word3','word4'])for(const[field,value]of Object.entries(row.modes[mode][kind]))if(typeof value==='number'){
   const diff=Math.abs(computed[mode][kind][field]-value);assert.ok(diff<1e-8,`${row.id}/${mode}/${kind}/${field}`);maxTrackDifference=Math.max(maxTrackDifference,diff);
  }
  const scores=[1,2,3].map(m=>search.normalize(computed,reference,m));scores.forEach((score,i)=>assert.ok(Math.abs(score-row.scores[i])<1e-9));
  results.push({id:row.id,initialMap:entry.initialMap,finalMap,audit,scores,maxTrackDifference});
  console.log(JSON.stringify(results.at(-1)));if(global.gc)global.gc();
 }
 const output={completed:true,scope:'Independent complete JS replay of three mutated smoke layouts; fixed UED initial map and own fixed robust policy; all 8 tracks and 1/2/3 costs',results,
  sourceHashes:Object.fromEntries([__filename,cfgPath,path.join(folder,'frontier.json'),html,path.join(ROOT,cfg.profile),...['score_completion_ckt_v4.js','score_ckt_v52.js','ckt_v4_model.js','ckt_block_error.js','search_untoned_cr7e_v52.js'].map(p=>path.join(ROOT,'tools',p))].map(p=>[p,hash(p)]))};
 fs.writeFileSync(path.join(ROOT,'research/notes/2026-11-20-u7e-fixed-gpu-js-verification.json'),JSON.stringify(output,null,2)+'\n');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
