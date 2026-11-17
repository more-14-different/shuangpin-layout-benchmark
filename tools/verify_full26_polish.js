'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {setup}=require('./polish_full26'),{neighborhood,signature}=require('./polish_2126_neighborhood');
const stateModel=require('./anneal_2126_model'),experiment=require('./explore_toned_2126');
const file=process.argv[2]||'research/notes/2026-11-17-toned-2126-full26-polish.json';
const report=JSON.parse(fs.readFileSync(file));assert.equal(report.complete,true);
const {source,bundle,context,hashes}=setup(report.input,process.argv[3]||'D:/C2D/Documents/rime-snow-pinyin');
assert.deepEqual(hashes,report.hashes,'input or scoring implementation changed');
const cache=new Map(report.evaluations.map(e=>[signature(e.state),e]));
assert.equal(cache.size,report.evaluations.length);
const replay=cache.get(signature(source.state));
for(const k of Object.keys(source.tracks))for(const f of Object.keys(source.tracks[k]))assert.ok(Math.abs(replay.tracks[k][f]-source.tracks[k][f])<1e-8,'seed track drift');
let previous=Infinity;
for(const h of report.history){assert.ok(h.score<previous-1e-10);previous=h.score;assert.ok(Math.abs(cache.get(signature(h.state)).score-h.score)<1e-10);}
const best=report.result,options=neighborhood(bundle,'full26',best.state);
for(const n of options){const e=cache.get(signature(n.state));assert.ok(e,'missing final neighbor');assert.ok(e.score>=best.score-1e-10,'better final neighbor');}
const policyStates=[best.state,...options.filter(n=>n.move.kind==='policy').map(n=>n.state)];assert.equal(new Set(policyStates.map(s=>s.policy)).size,144);
for(const pass of report.passes){const anchor=cache.get(signature(pass.anchorState));assert.ok(Math.abs(anchor.score-pass.anchorScore)<1e-10);const neighbors=neighborhood(bundle,'full26',pass.anchorState);assert.equal(neighbors.length,pass.neighborCount);const min=Math.min(anchor.score,...neighbors.map(n=>{const e=cache.get(signature(n.state));assert.ok(e);return e.score;}));assert.ok(Math.abs(min-pass.bestScore)<1e-10);}
const layout=stateModel.layout(bundle,'full26',best.state);assert.deepEqual(layout.tonedCodes,best.layout.tonedCodes);
const independent=experiment.evaluate(layout,source.tokenKeys,context,stateModel.policies[best.state.policy]);
assert.ok(Math.abs(independent.score-best.score)<1e-10);
for(const k of Object.keys(independent.tracks))for(const f of Object.keys(independent.tracks[k]))assert.ok(Math.abs(independent.tracks[k][f]-best.tracks[k][f])<1e-8);
console.log(JSON.stringify({passed:true,score:best.score,independentDifference:independent.score-best.score,
  finalNeighbors:options.length,policies:144,evaluations:cache.size,history:report.history.map(h=>h.score)}));
