import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),joint=require('../tools/search_untoned_cr7e_joint'),sw=require('../tools/search_untoned_cr7e_switch_open'),search=require('../tools/search_untoned_cr7e_v52'),{mappingKey}=require('../tools/search_untoned_cr7e_coupled'),fs=require('node:fs'),{auxiliarySemantics,toneKeysFromShapeKeys}=require('../tools/auxiliary_semantics');
test('atomic final repair can finance an initial change whose standalone mapping exceeds M42',()=>{
 const {prior,anchors}=joint.inputs(),a=anchors[0],initialMap={...a.initialMap,A:'R',E:'N',O:'C'},template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]},inspect=sw.openScreening(prior.auditInput,JSON.parse(fs.readFileSync('tools/ckt_v4_upstream_role_tables.json','utf8')));
 const naive={initialMap,finalMap:a.finalMap};assert.equal(search.audit(search.rebuild({...template,...naive},prior.auditInput),prior.auditInput).M,43);assert.equal(sw.valid(naive,inspect),null);
 const fm={...a.finalMap,e:'E',en:a.finalMap.e},reference={initialMap,finalMap:fm};assert.ok(sw.valid(reference,inspect));const pool=joint.jointPool(a,reference,inspect,1234),picks=joint.selectJoint(pool,a,1235);assert.equal(picks.length,32);assert.equal(new Set(picks.map(mappingKey)).size,32);
 assert.ok(picks.every(r=>sw.valid(r,inspect)&&sw.initialKey(r.initialMap)===sw.initialKey(initialMap)));assert.ok(pool.every(r=>r.finalMap.e==='E'));assert.deepEqual(picks.map(mappingKey),joint.selectJoint(pool,a,1235).map(mappingKey));
 const sem=auxiliarySemantics('IVUAO');assert.equal(sem.toneDigitsByShapeMeaning,'42310');assert.equal(toneKeysFromShapeKeys(sem.shapeKeysByMeaning),'IVUAO');
});
test('feature focus prioritizes but does not freeze the remaining finals',()=>{
 const {prior,anchors}=joint.inputs(),a=anchors[0],inspect=sw.openScreening(prior.auditInput,JSON.parse(fs.readFileSync('tools/ckt_v4_upstream_role_tables.json','utf8'))),pool=joint.jointPool(a,a,inspect,678),picks=joint.selectJoint(pool,a,679);
 assert.ok(pool.some(r=>r.finalMap.a!==a.finalMap.a));assert.ok(pool.some(r=>r.finalMap.ing!==a.finalMap.ing));assert.equal(picks.length,32);assert.ok(joint.FLEX.includes('eng')&&joint.FLEX.includes('ing')&&joint.FLEX.includes('uan')&&joint.FLEX.includes('v'));
});
test('global two/three-key relabeling preserves the exact syllable collision partition',()=>{
 const relabel=require('../tools/search_untoned_cr7e_joint_relabel'),{prior,anchors}=joint.inputs(),a=anchors[0],template={...prior.results.find(r=>r.id==='OC21-e1f155973380'),capacity:[21,21]},old=search.rebuild({...template,...a},prior.auditInput),rows=[...relabel.cycles()];
 assert.equal(rows.length,2870);for(const cycle of [['K','P'],['K','P','E']]){const row=relabel.relabel(a,cycle),entry=search.rebuild({...template,...row},prior.auditInput);assert.deepEqual(relabel.partition(old.codeList,prior.auditInput.base),relabel.partition(entry.codeList,prior.auditInput.base));}
});
