'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {loadContext} = require('./frontier_toned_2126');
const {marsRhymeIndex} = require('./mars_toned_factorization');
const experiment = require('./explore_toned_2126');
const {prepare} = require('./fast_toned_2126');
const model = require('./anneal_2126_model');
const [out, snow] = process.argv.slice(2);
if (!out || !snow) throw new Error('usage: node tools/prepare_anneal_2126.js BUNDLE_DIR SNOW_DIR');
if (fs.existsSync(path.join(out,'manifest.json'))) throw new Error('bundle exists; use a new directory');
fs.mkdirSync(out,{recursive:true});
const names = {keep:'regroup-keep-refine', swap:'regroup-swap', full26:'regroup-26-refine'};
const sources = Object.fromEntries(Object.entries(names).map(([k,n])=>[k,JSON.parse(fs.readFileSync(`research/notes/2026-11-13-toned-2126-${n}.json`))]));
const source = sources.keep;
const context = loadContext(source, path.resolve(snow));
const inv = JSON.parse(fs.readFileSync('research/config/ckt-v51-toned-2121-seeds.json'));
const rootByFinal = Object.fromEntries(inv.decomposition.map(x=>[x.fullFinal,x.rhymeBody==='_'?x.fullFinal:x.rhymeBody]));
const rootNames = [...new Set(Object.values(rootByFinal))].sort(); assert.equal(rootNames.length,18);
const finalRoots = Object.fromEntries(Object.entries(rootByFinal).map(([f,r])=>[f,rootNames.indexOf(r)]));
const byPy = new Map(inv.decomposition.map(x=>[x.pinyin,x.fullFinal]));
const tokens = source.tokenKeys.map((t,i)=>({root:finalRoots[byPy.get(t.slice(0,-1))],tone:Number(t.slice(-1)),first:source.results[0].layout.tonedCodes[i][0]}));
const bundle = {version:1,rootNames,finalRoots,tokens,tokenKeys:source.tokenKeys,policies:model.policies,seeds:{},sources:source.sources};
const fast = prepare(source.tokenKeys,context);
for (const [route,s] of Object.entries(sources)) {
  assert.deepEqual(s.sources,source.sources); assert.deepEqual(s.tokenKeys,source.tokenKeys);
  const winner=s.results[0],l=winner.layout;
  l.tonedCodes.forEach((c,i)=>assert.equal(c[0],tokens[i].first));
  const partition=rootNames.map(r=>{
    const finals=Object.keys(rootByFinal).filter(f=>rootByFinal[f]===r);
    const groups=finals.map(f=>l.finalGroups?.[f]??marsRhymeIndex(f));
    assert.equal(new Set(groups).size,1); return groups[0];
  });
  const state={partition,maps:l.regionMaps,policy:model.policies.findIndex(p=>JSON.stringify(p)===JSON.stringify(winner.policy))};
  bundle.seeds[route]={state,score:winner.score,toneRowsByTone:l.toneRowsByTone,rowCounts:route==='full26'?[10,9,7]:[9,9,7],qEmpty:route!=='full26',source:names[route]};
  const rebuilt=model.layout(bundle,route,state);assert.deepEqual(rebuilt.tonedCodes,l.tonedCodes);
  const actual=fast(rebuilt,winner.policy), oracle=experiment.evaluate(rebuilt,source.tokenKeys,context,winner.policy);
  assert.ok(Math.abs(actual.score-winner.score)<1e-10);
  for(const k of Object.keys(oracle.tracks))for(const f of Object.keys(oracle.tracks[k])) assert.ok(Math.abs(oracle.tracks[k][f]-actual.tracks[k][f])<1e-8);
  console.log(route,actual.score,'original scorer parity passed');
}
// GPU proposal heuristic only: weighted token motor cost and sampled word bucket collisions.
const indices=new Map(source.tokenKeys.map((t,i)=>[t,i]));
const weight=Array(tokens.length).fill(0);
const get=(py,t)=>indices.get(`${context.data.pinyin[py]}${t===0?5:t}`);
for(const [text,py,t,w,common] of context.data.characters) if(common && w>0 && get(py,t)!==undefined)weight[get(py,t)]+=w;
const total=weight.reduce((a,b)=>a+b,0);bundle.proxyWeights=weight.map(w=>w/total);
bundle.proxyMotor=tokens.map(t=>[... 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(k=>context.motor(t.first+k).upperMs));
bundle.proxyWords={};
for(const kind of ['word2','word3']) {
  const words=[...context.words[kind]].sort((a,b)=>b.weight-a.weight).slice(0,4096);
  const sum=words.reduce((s,w)=>s+w.weight,0);
  bundle.proxyWords[kind]=words.map(w=>({tokens:w.py.map((py,i)=>get(py,w.tones[i])),weight:w.weight/sum}));
}
const files={};
for(const [name,value] of Object.entries({'search.json':bundle,'corpus.json':{data:context.data,words:context.words,reference:{tracks:context.reference.tracks},motorSnapshot:JSON.parse(fs.readFileSync(path.join(__dirname,'ckt_v4_upstream_role_tables.json')))}})) {
  const text=JSON.stringify(value);fs.writeFileSync(path.join(out,name),text);files[name]=crypto.createHash('sha256').update(text).digest('hex');
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({version:1,files,sources:source.sources,seedScores:Object.fromEntries(Object.entries(bundle.seeds).map(([k,v])=>[k,v.score]))},null,2));
console.log('Portable bundle ready:',path.resolve(out));
