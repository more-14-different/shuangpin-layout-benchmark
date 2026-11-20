import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),sw=require('../tools/search_untoned_cr7e_switch'),{screening,mappingKey}=require('../tools/search_untoned_cr7e_coupled'),fs=require('node:fs'),{auxiliarySemantics,toneKeysFromShapeKeys}=require('../tools/auxiliary_semantics');
test('small final gains force changing initials and strong gains get a strictly bounded extension',()=>{
 assert.equal(sw.shouldContinue(0,1),false);assert.equal(sw.shouldContinue(.002999,1),false);assert.equal(sw.shouldContinue(.003,1),true);assert.equal(sw.shouldContinue(.01,2),true);assert.equal(sw.shouldContinue(.01,3),false);
 const semantics=auxiliarySemantics('IVUAO');assert.equal(semantics.toneDigitsByShapeMeaning,'42310');assert.equal(toneKeysFromShapeKeys(semantics.shapeKeysByMeaning),'IVUAO');
});
test('each selected initial differs from its anchor and prior trials while keeping exact D2 and M41/M42',()=>{
 const {prior,anchors}=sw.inputs(),inspect=screening(prior.auditInput,JSON.parse(fs.readFileSync('tools/ckt_v4_upstream_role_tables.json','utf8'))),tried=new Set();
 const pool=sw.initialPool(anchors[0],inspect,tried);assert.ok(pool.rows.length>100);const first=sw.pickInitial(pool.rows,0);assert.notEqual(sw.initialKey(first.initialMap),sw.initialKey(anchors[0].initialMap));tried.add(sw.initialKey(first.initialMap));
 const next=sw.initialPool(anchors[0],inspect,tried);assert.ok(next.rows.every(r=>!tried.has(sw.initialKey(r.initialMap))));
 for(const r of [first,sw.pickInitial(next.rows,2)]){const a=inspect(r);assert.equal(a.D,2);assert.ok([41,42].includes(a.M));const rows=sw.finalPool(r,inspect,1234),picks=sw.selectFinals(rows,1235);assert.equal(picks.length,32);assert.equal(new Set(picks.map(mappingKey)).size,32);assert.deepEqual(picks.map(mappingKey),sw.selectFinals(rows,1235).map(mappingKey));assert.ok(picks.every(p=>sw.initialKey(p.initialMap)===sw.initialKey(r.initialMap)&&sw.valid(p,inspect)));}
});
test('temporary bucket relaxation admits QZ occupancy while preserving every other domain and memory rule',()=>{
 const open=require('../tools/search_untoned_cr7e_switch_open'),search=require('../tools/search_untoned_cr7e_v52'),{prior,anchors}=sw.inputs(),snapshot=JSON.parse(fs.readFileSync('tools/ckt_v4_upstream_role_tables.json','utf8')),strict=screening(prior.auditInput,snapshot),relaxed=open.openScreening(prior.auditInput,snapshot),seed=anchors[0];
 const finalMap={...seed.finalMap,ia:seed.finalMap.ao,ao:seed.finalMap.ia},row={initialMap:seed.initialMap,finalMap},template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]},audit=search.audit(search.rebuild({...template,...row},prior.auditInput),prior.auditInput);
 assert.equal(audit.qz,true);assert.equal(audit.D,2);assert.equal(audit.M,42);assert.equal(audit.valid,true);assert.equal(strict(row),null);assert.ok(open.valid(row,relaxed));assert.deepEqual(strict(seed,true),relaxed(seed,true));
});
