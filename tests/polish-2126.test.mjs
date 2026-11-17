import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import model from '../tools/anneal_2126_model.js';
import polish from '../tools/polish_2126_neighborhood.js';
const b=JSON.parse(fs.readFileSync('research/notes/2026-11-16-anneal-2126-best-full26.json'));
const inv=JSON.parse(fs.readFileSync('research/config/ckt-v51-toned-2121-seeds.json'));
const roots=[...new Set(inv.decomposition.map(d=>d.rhymeBody==='_'?d.fullFinal:d.rhymeBody))].sort();
const byPy=new Map(inv.decomposition.map(d=>[d.pinyin,d]));
const bundle={rootNames:roots,finalRoots:Object.fromEntries(inv.decomposition.map(d=>[d.fullFinal,roots.indexOf(d.rhymeBody==='_'?d.fullFinal:d.rhymeBody)])),tokens:b.tokenKeys.map((t,i)=>{const d=byPy.get(t.slice(0,-1));return{root:roots.indexOf(d.rhymeBody==='_'?d.fullFinal:d.rhymeBody),tone:Number(t.slice(-1)),first:b.layout.tonedCodes[i][0]};}),seeds:{full26:{rowCounts:[10,9,7],qEmpty:false,toneRowsByTone:b.layout.toneRowsByTone}}};
test('polishing enumerates the complete union of legal elementary operations',()=>{
 const before=JSON.stringify(b.state),got=polish.neighborhood(bundle,'full26',b.state);
 const keys=new Set(got.map(n=>polish.signature(n.state)));
 assert.equal(keys.size,got.length);assert.equal(JSON.stringify(b.state),before);
 const check=s=>{let legal;try{model.layout(bundle,'full26',s);legal=polish.signature(s)!==polish.signature(b.state);}catch{legal=false;}assert.equal(keys.has(polish.signature(s)),legal);};
 for(let a=0;a<18;a++){
  for(let group=0;group<10;group++){const s=structuredClone(b.state);s.partition[a]=group;check(s);}
  for(let c=a+1;c<18;c++){const s=structuredClone(b.state);[s.partition[a],s.partition[c]]=[s.partition[c],s.partition[a]];check(s);}
 }
 for(let r=0;r<3;r++)for(let a=0;a<10;a++){
  for(let k=0;k<[10,9,7][r];k++){const s=structuredClone(b.state);s.maps[r][a]=k;check(s);}
  for(let c=a+1;c<10;c++){const s=structuredClone(b.state);[s.maps[r][a],s.maps[r][c]]=[s.maps[r][c],s.maps[r][a]];check(s);}
 }
 for(let p=0;p<144;p++)check({...b.state,policy:p});
 assert.equal(got.filter(n=>n.move.kind==='policy').length,143);
 console.log('full26 initial neighbors',got.length);
});
test('reconstruction preserves root groups, first keys, tone rows and exact row occupancy',()=>{
 const l=model.layout(bundle,'full26',b.state);assert.deepEqual(l.tonedCodes,b.layout.tonedCodes);
 for(const n of polish.neighborhood(bundle,'full26',b.state)){
  const candidate=model.layout(bundle,'full26',n.state);
  assert.ok(candidate.tonedCodes.every((c,i)=>c[0]===b.layout.tonedCodes[i][0]));
 }
});
