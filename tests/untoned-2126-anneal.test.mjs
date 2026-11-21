import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
test('ledger audit rejects illegal intermediate states in a declared legal walk but permits raw compounds',()=>{
  const {verifyProposal}=require('../tools/verify_untoned_2126_anneal');
  assert.equal(typeof verifyProposal,'function');
  const apply=(s,i)=>{const v=s.slice();v[i]^=1;return v;},guard=s=>s[0]===0;
  const key=Buffer.from([0,0]).toString('base64');
  const row={fromKey:key,key,phase:'coarse',path:[0,0],proposalKind:'hard-legal random walk'};
  assert.throws(()=>verifyProposal(row,[0,1],guard,apply),/intermediate/i);
  assert.doesNotThrow(()=>verifyProposal({...row,proposalKind:'unrestricted compound, final hard gate'},[0,1],guard,apply));
  assert.throws(()=>verifyProposal({...row,path:[0,0,0,0,0],proposalKind:'unrestricted compound, final hard gate'},[0,1],guard,apply),/length/i);
  assert.throws(()=>verifyProposal({...row,path:Array(8).fill(0),proposalKind:'unrestricted compound, final hard gate'},[0,1],guard,apply),/exceeds four/i);
  assert.throws(()=>verifyProposal({...row,phase:'fine',path:[0,0]},[0,1],guard,apply),/length/i);
});
test('route trace rejects an arbitrary earlier state and checks the permitted reheat reservoir',()=>{
  const {routeTrace}=require('../tools/verify_untoned_2126_anneal');
  assert.equal(typeof routeTrace,'function');
  const trace=routeTrace(['a','b'],[{cycle:0,chain:0,bestKey:'fine'}]);
  trace.coarse({cycle:0,chain:0,fromKey:'a',key:'a2',accepted:true},new Set(),()=>true);
  assert.throws(()=>trace.coarse({cycle:0,chain:0,fromKey:'old',key:'x',accepted:false},new Set(),()=>true),/route/i);
  trace.coarse({cycle:1,chain:0,fromKey:'fine',key:'f2',accepted:true},new Set(['restart']),()=>true);
  assert.throws(()=>trace.coarse({cycle:1,chain:1,fromKey:'unapproved',key:'x',accepted:false},new Set(['restart']),()=>true),/reservoir/i);
  trace.coarse({cycle:1,chain:1,fromKey:'restart',key:'r2',accepted:false},new Set(['restart']),()=>true);
  assert.deepEqual(trace.finish('coarse',()=>true),['f2','restart']);
});
test('a budget-truncated first coarse wave verifies unproposed reheated routes against the reservoir',()=>{
  const {routeTrace}=require('../tools/verify_untoned_2126_anneal');
  const trace=routeTrace(['a','b'],[]);
  trace.coarse({cycle:1,chain:0,fromKey:'a',key:'a2',accepted:true},new Set(['restart']),()=>true);
  assert.deepEqual(trace.finish('coarse',()=>true,['a2','restart'],new Set(['restart'])),['a2','restart']);
  const bad=routeTrace(['a','b'],[]);
  bad.coarse({cycle:1,chain:0,fromKey:'a',key:'a2',accepted:true},new Set(['restart']),()=>true);
  assert.throws(()=>bad.finish('coarse',()=>true,['a2','wrong'],new Set(['restart'])),/reservoir/i);
});
test('compacted archive preserves the fixed starting score and historical verification',()=>{
  const fs=require('node:fs');
  // A stopped and compacted archive must not import a deleted resumable checkpoint.
  const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
  const contract=read('../research/config/untoned-2126-anneal-100k-contract.json');
  const summary=read('../research/notes/2026-11-15-untoned-2126-anneal-100k-summary.json');
  const verified=read('../research/notes/2026-11-15-untoned-2126-anneal-100k-verification.json');
  assert.equal(contract.startingBestCKTV51,9.078652093288046);
  assert.equal(summary.bestScore,contract.startingBestCKTV51);
  assert.equal(summary.totalNew,100000);assert.equal(verified.passed,true);
  assert.equal(summary.retention.resumeOriginalTrajectoryAvailable,false);
});
test('new-score budget reserves only previously unseen unique states and never exceeds the limit',()=>{
  const {reserveUnique}=require('../tools/anneal_untoned_2126_v51');
  const known=new Set(['old']),rows=[{key:'old'},{key:'a'},{key:'a'},{key:'b'},{key:'c'}];
  assert.deepEqual(reserveUnique(rows,known,2).map(r=>r.key),['a','b']);
  assert.deepEqual(reserveUnique(rows,known,0),[]);
  assert.deepEqual([...known],['old']);
});
test('annealing admits downhill moves and permits bounded uphill moves at positive temperature',()=>{
  const {acceptMove}=require('../tools/anneal_untoned_2126_v51');
  assert.equal(acceptMove(9,8.9,0,.999),true);
  assert.equal(acceptMove(9,9.01,0,0),false);
  assert.equal(acceptMove(9,9.01,.02,.1),true);
  assert.equal(acceptMove(9,9.01,.02,.9),false);
});
test('energy separates exploration comfort penalties and profile preferences from native CKT',()=>{
  const {energy}=require('../tools/anneal_untoned_2126_v51');
  const baseline={mx:142,homeS2:.44,homeFloor:.31,wMax:.058,characterMotor:100};
  const a={score:9.08,characterMotor:100,erg:{mx:143,homeS2:.45,homeFloor:.32,wMax:.06}};
  const b={...a,characterMotor:102},c={...a,erg:{...a.erg,mx:140}};
  assert.equal(energy(a,'speed',baseline),a.score);
  assert.ok(energy(b,'balanced',baseline)>energy(a,'balanced',baseline));
  assert.ok(energy(c,'speed',baseline)>energy(a,'speed',baseline));
  assert.ok(energy(a,'move',baseline)<energy({...a,erg:{...a.erg,mx:142}},'move',baseline));
  assert.equal(b.score,9.08);
});
test('Pareto archiving removes dominated points while retaining speed and ergonomics tradeoffs',()=>{
  const {updateFrontier}=require('../tools/anneal_untoned_2126_v51');
  const make=(key,score,mx)=>({key,score,erg:{mx,homeS2:.44,homeFloor:.31,wMax:.06,rpMax:.03,yMax:.06}});
  const a=make('a',9.1,142),b=make('b',9.0,142),c=make('c',9.05,144);
  assert.deepEqual(updateFrontier([a],b).map(r=>r.key),['b']);
  assert.deepEqual(updateFrontier([b],c).map(r=>r.key),['b','c']);
  assert.deepEqual(updateFrontier([b,c],make('d',9.2,140)).map(r=>r.key),['b','c']);
});
test('frontier keeps a motion-friendly layout even when another layout is faster on native CKT',()=>{
  const {updateFrontier}=require('../tools/anneal_untoned_2126_v51');
  const erg={mx:143,homeS2:.44,homeFloor:.31,wMax:.06,rpMax:.03,yMax:.06};
  const balanced={key:'balanced',score:9.083,characterMotor:98,erg};
  const speed={key:'speed',score:9.078,characterMotor:99,erg};
  assert.deepEqual(updateFrontier([balanced],speed).map(r=>r.key),['balanced','speed']);
});
test('annealing imports preserve the explicit auxiliary semantics',()=>{
  const fs=require('node:fs'),{compactState,expandState}=require('../tools/search_untoned_2126_coupled');
  const {auxiliarySemantics}=require('../tools/auxiliary_semantics');
  const row=JSON.parse(fs.readFileSync(new URL('../research/config/untoned-2126-recenter-finalist.json',import.meta.url),'utf8'));
  const layout=expandState(compactState(row)),semantics=auxiliarySemantics(layout.tone);
  assert.deepEqual(layout.initialMap,row.initialMap);assert.deepEqual(layout.finalMap,row.finalMap);
  assert.equal(layout.tone,row.toneKeysByTone);assert.equal(semantics.shapeKeysByMeaning,row.shapeKeysByMeaning);
  assert.equal(semantics.toneDigitsByShapeMeaning,'42310');
});
