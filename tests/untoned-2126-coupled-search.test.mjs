import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const root=path.resolve(import.meta.dirname,'..');

test('coupled operations may repair an illegal intermediate and do not mutate their input',()=>{
  const {operations,applyOperation}=require('../tools/search_untoned_2126_coupled.js');
  const state=Array.from({length:62},(_,i)=>i%26);
  const op=operations().find(o=>o.kind==='token-move'&&o.indices[0]===0&&o.to===25);
  const before=[...state],moved=applyOperation(state,op);
  assert.deepEqual(state,before);assert.equal(moved[0],25);
  const restore=operations().find(o=>o.kind==='token-move'&&o.indices[0]===0&&o.to===state[0]);
  assert.deepEqual(applyOperation(moved,restore),state);
  const swap=operations().find(o=>o.kind==='token-swap'&&o.indices[0]===0&&o.indices[1]===1);
  assert.deepEqual(applyOperation(applyOperation(state,swap),swap),state);
});

test('compact final-state guard agrees with full Common399 memory and encoding audit',{skip:!fs.existsSync(path.join(root,'a7_CKT_R11.html'))},()=>{
  const {compactState,expandState,makeGuard,operations,applyOperation}=require('../tools/search_untoned_2126_coupled.js');
  const search=require('../tools/search_untoned_production_v51');
  const data=require('../tools/score_completion_ckt_v4').loadPayload(path.join(root,'a7_CKT_R11.html'));
  const production=data.entries.find(e=>e.id==='SNOW-SHENYUN-21X26-D3V1-BALANCED');
  const base=JSON.parse(fs.readFileSync(path.join(root,'research/config/untoned-2126-double-empty-closure-finalist.json')));
  const state=compactState(base),guard=makeGuard(data),ops=operations();
  assert.equal(guard(state),true);
  let rng=20261114;
  for(let i=0;i<600;i++) {
    rng=(Math.imul(rng,1664525)+1013904223)>>>0;const a=ops[rng%ops.length];
    rng=(Math.imul(rng,1664525)+1013904223)>>>0;const b=ops[rng%ops.length];
    const candidate=applyOperation(applyOperation(state,a),b);
    const entry=search.rebuild({...production,...expandState(candidate)},data);
    const expected=search.legal({audit:search.audit(entry,data)},{audit:search.audit(production,data)});
    assert.equal(guard(candidate),expected,JSON.stringify([a,b]));
  }
});
