'use strict';
// Fresh ordinary R11 engines; no cached candidate statistics or toned adapter.
const fs=require('node:fs'),crypto=require('node:crypto');
const scorer=require('./score_completion_ckt_v4'),columns=require('./score_toned_benchmark_columns');
const {TONED_BENCHMARK_TRACKS,tonedGeneralizedScore}=require('./toned_benchmark_metrics');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const html='a7_CKT_R11.html',data=scorer.loadPayload(html),engines=columns.loadEngines(fs.readFileSync(html,'utf8'),data);
const {Engine7:engine,CKTEngine:ckt}=engines;
const source='research/notes/2026-11-18-lan-aeo-untoned.json',family=read(source).families[0];
if(!read(source).completed)throw Error('enumeration is incomplete');
const variants=family.rows.filter(r=>r.target!=='original');
const byScore=items=>[...items].sort((a,b)=>a.score-b.score)[0];
const byDay=items=>[...items].sort((a,b)=>b.erg20.mx-a.erg20.mx)[0];
const targets=[...new Set(['original','C','R','N','F',byScore(variants).target,
  byScore(variants.filter(r=>!['C','R'].includes(r.target))).target,byDay(variants).target])];
const result={version:'lan-aeo-untoned-column-comparison-v1',targets,sourceHashes:{[source]:hash(source),
  [__filename]:hash(__filename)},htmlSha256:hash(html),results:[]};
for(const target of targets){
  const entry=read('research/.cache/lan-aeo-all-20261118/untoned-'+target+'.entry.json');
  const tracks={},quick={};
  for(const [track,spec] of Object.entries(TONED_BENCHMARK_TRACKS)){
    const opt={...spec,cohort:'common',boundary:'none',confirm:0,model:'ckt'};
    const stat=ckt.evaluate(entry,opt);
    tracks[track]=Object.fromEntries(Object.entries(stat).filter(([,v])=>typeof v==='number'||typeof v==='boolean'));
    tracks[track].load=Array.from(stat.load);
    const aggregate=engine.aggregate(engine.rowsFor(entry,opt),{...opt,boundary:'iid'});
    quick[track]={e34:engine.project(aggregate,engine.costs('e34')).eq,
      geometry:engine.project(aggregate,engine.costs('geometry')).eq};
  }
  const ensemble={};
  for(const [name,snapshot] of Object.entries({v1:data.ensemble,v2:data.ensembleV2,v3:data.ensembleV3,v4:data.ensembleV4}))
    ensemble[name]=columns.normalizeLegacy(quick,snapshot,true);
  ensemble.v5=columns.normalizeLegacy(tracks,data.ensembleV5);
  ensemble.v6=tonedGeneralizedScore(Object.entries(data.ensembleV6.trackWeights).map(([track,weight])=>({weight,
    value:tracks[track].upperMs+150*tracks[track].miss,
    reference:data.ensembleV6.referenceValues[track].guarded+150*data.ensembleV6.referenceValues[track].nonfirst})));
  const keys=data.reference.keys+'_',share=(track,letters)=>[...letters].reduce((sum,k)=>sum+(tracks[track].load[keys.indexOf(k)]||0),0);
  const load={homeS2:share('S2','ASDFGHJKL'),leftPinkyMax20:Math.max(...Object.keys(tracks).map(t=>share(t,'QAZ'))),
    rightPinkyMax20:Math.max(...Object.keys(tracks).map(t=>share(t,'P'))),
    maxFinger20:Math.max(...Object.values(tracks).map(t=>t.maxFinger)),sameFingerS2:tracks.S2.sfb};
  if(target==='original')for(const [field,dataKey] of [['v5','ensembleV5'],['v4','ensembleV4']]){
    const expected=data[dataKey].values[family.baselineId].score;
    if(Math.abs(ensemble[field]-expected)>1e-9)throw Error('original atlas column mismatch '+field);
  }
  result.results.push({target,id:entry.id,ensemble,load,tracks,quick});
  fs.writeFileSync('research/notes/2026-11-18-lan-aeo-untoned-columns.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({target,ensemble,load}));
}
