'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const entries={
 polished:{modelKey:'polished',id:'T2126-POLISHED-8832091',name:'21×26 带调 · 精修冠军 10/9/7',sourcePath:'research/notes/2026-11-17-toned-2126-best-full26-polished.json'},
 longrun:{modelKey:'longrun',id:'T2126-ANNEAL-8842639',name:'21×26 带调 · 长跑冠军 10/9/7',sourcePath:'research/notes/2026-11-16-anneal-2126-best-full26.json'},
 '26':{modelKey:'oldFull26',id:'T2126-FULL26-8871530',name:'21×26 带调 · 原前沿 10/9/7',sourcePath:'research/notes/2026-11-13-toned-2126-regroup-26-refine.json'},
 keep:{modelKey:'oldQEmpty',id:'T2126-QEMPTY-8890382',name:'21×26 带调 · Q韵空键均衡代表 9/9/7',sourcePath:'research/notes/2026-11-13-toned-2126-regroup-keep-refine.json'},
 newKeep:{modelKey:'newQEmpty',id:'T2126-QEMPTY-ANNEAL-8879093',name:'21×26 带调 · Q韵空键长跑代表 9/9/7',sourcePath:'research/notes/2026-11-16-anneal-2126-best-keep.json'},
 newSwap:{modelKey:'newSwap',id:'T2126-QEMPTY-SWAP-8918781',name:'21×26 带调 · Q韵空键上四代表 9/9/7',sourcePath:'research/notes/2026-11-16-anneal-2126-best-swap.json'},
};
const rankingPath='research/notes/2026-11-17-toned-2126-publication-policies.json';
const policyInputPath='research/notes/2026-11-17-toned-2126-robustness-input.json';
function load(which){
 const entry=entries[which];assert.ok(entry,'unknown representative '+which);
 const source=JSON.parse(fs.readFileSync(entry.sourcePath));const original=source.results?.[0]||source;
 const ranking=JSON.parse(fs.readFileSync(rankingPath));assert.equal(ranking.complete,true);
 assert.equal(ranking.inputSha256,crypto.createHash('sha256').update(fs.readFileSync(policyInputPath)).digest('hex'));
 const input=JSON.parse(fs.readFileSync(policyInputPath));const model=input.models.find(m=>m.key===entry.modelKey);
 assert.equal(model.layoutId,original.layout.id);
 const winner=ranking.selected[entry.modelKey];
 const value=model.evaluations.find(e=>e.policyKey===winner.policy);assert.ok(value);
 const policy=Object.fromEntries(['word2','word3','word4'].map((k,i)=>[k,winner.policy.split('/')[i]]));
 return {...entry,source,best:{...original,policy,score:value.score},robustness:{rankingPath,policyInputPath,
   criterion:ranking.choiceRule,selectedPolicy:winner.policy,nominalSeedScore:original.score,
   grids:Object.fromEntries(Object.entries(ranking.grids).map(([name,g])=>[name,{range:g.range,step:g.step,points:g.points,
     ...g.models[entry.modelKey].ranking.find(row=>row.policy===winner.policy)}]))}};
}
module.exports={entries,load,rankingPath,policyInputPath};
