#!/usr/bin/env node
'use strict';
// Independent replay through the frozen 20-contract Engine7/CKTEngine,
// separate from the native v5.1 competition scorer and ergonomic matrices.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {rebuild}=require('./search_untoned_production_v51');
const {loadPayload}=require('./score_completion_ckt_v4');
const root=path.resolve(__dirname,'..');
const replay=path.join(root,'research/.cache/R11_integrated_replay');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function main() {
  const files=process.argv.slice(2);
  if(!files.length)throw Error('pass search result JSON files');
  const data=loadPayload(path.join(root,'a7_CKT_R11.html'));
  require(path.join(replay,'script1.js'));require(path.join(replay,'script2.js'));
  Engine7.init(data);CKTEngine.init(data);
  const specs=read(path.join(replay,'track_options.json'));
  for(const file of files) {
    const report=read(file),output=[];
    if(hash(path.join(root,'a7_CKT_R11.html'))!==report.sources.htmlSha256)
      throw Error('HTML changed since the native scoring run');
    const target=file.replace(/\.json$/, '-independent-audit.json');
    const previous=fs.existsSync(target)?read(target):null;
    const reusable=previous?.sourceHtmlSha256===report.sources.htmlSha256
      ?new Map(previous.results.filter(r=>Number.isFinite(r.a7eV5)).map(r=>[r.id,r])):new Map();
    const save=()=>fs.writeFileSync(target,JSON.stringify({version:'untoned-v51-finalists-20-contract-replay-1',source:path.basename(file),sourceHtmlSha256:report.sources.htmlSha256,results:output},null,2)+'\n');
    for(const family of report.families) {
      const sorted=[...family.results].sort((a,b)=>a.score-b.score);
      const selected=[family.results[0],...sorted.filter(e=>e.score<family.baseline.score),...sorted.filter(e=>e.strictComfort).slice(0,3),...sorted.slice(0,2)];
      const unique=[...new Map(selected.map(e=>[e.id,e])).values()];
      const template=data.entries.find(e=>e.id===family.id);
      for(const row of unique) {
        const cached=reusable.get(row.id);
        if(cached?.score===row.score) {output.push(cached);save();continue;}
        const entry=rebuild({...template,...row,tone:row.toneKeysByTone,id:`independent:${row.id}`},data);
        const tracks={};
        for(const [name,spec] of Object.entries(specs)) {
          const opt={...spec,model:'ckt',confirm:0,uniform:false,cohort:'common',boundary:'none'};
          const z=CKTEngine.evaluate(entry,opt,false);
          const ag=Engine7.aggregate(Engine7.rowsFor(entry,opt),{...opt,boundary:'iid'});
          const e34=Engine7.project(ag,Engine7.costs('e34'));
          const geo=Engine7.project(ag,Engine7.costs('geometry'));
          tracks[name]={home:z.home,sfb:z.sfb,maxFinger:z.maxFinger,rightPinky:z.rightPinky,upperMs:z.upperMs,e34:e34.eq,geometry:geo.eq};
        }
        let e4=0;const contract=data.ensembleV4;
        for(const [name,w] of Object.entries(contract.trackWeights))for(const modelName of ['e34','geometry'])
          e4+=w*.5*(tracks[name][modelName]/contract.baselines[`${name}|${modelName}`])**contract.beta;
        let e5=0;for(const [name,w] of Object.entries(data.ensembleV5.trackWeights))e5+=w*(tracks[name].upperMs/data.ensembleV5.baselines[name])**4;
        const summary={family:family.id,id:row.id,mutation:row.mutation,score:row.score,audit:row.audit,erg:row.erg,
          a7eV4:10*e4**(1/contract.beta),a7eV5:10*e5**.25,tracks};
        const delta=Math.abs(tracks.S2.home-row.erg.homeS2);
        if(delta>1e-10)throw Error(`independent load mismatch ${delta}`);
        if(Math.abs(Math.min(...Object.values(tracks).map(t=>t.home))-row.erg.homeFloor)>1e-10)throw Error('independent home floor mismatch');
        output.push(summary);save();console.log(JSON.stringify({id:row.id,score:row.score,a7eV4:summary.a7eV4,s2e34:tracks.S2.e34,sfb:tracks.S2.sfb}));
      }
    }
    save();
  }
}
if(require.main===module)main();
