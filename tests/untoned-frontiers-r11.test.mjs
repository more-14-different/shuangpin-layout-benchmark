import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),publish=require('../tools/finalize_untoned_frontiers_r11'),{auxiliarySemantics,toneKeysFromShapeKeys}=require('../tools/auxiliary_semantics');
test('robust auxiliary-policy strings adapt without changing shape/tone meaning',()=>{
 const p=publish.policyObjects({keytao:'12/231/24',sanpin:'12/213/23'});assert.deepEqual(p.keytao,{word2:'12',word3:'231',word4:'24'});
 const sem=auxiliarySemantics('IVUAO');assert.equal(sem.shapeKeysByMeaning,'AVUIO');assert.equal(sem.toneDigitsByShapeMeaning,'42310');assert.equal(toneKeysFromShapeKeys(sem.shapeKeysByMeaning),'IVUAO');
});
test('terminal-load aggregation uses expected keystrokes before taking shares and retains peak tracks',()=>{
 const kinds=['character','word2','word3','word4'],tracks=Object.fromEntries(['keytao','sanpin'].map(m=>[m,Object.fromEntries(kinds.map((k,i)=>[k,{meanKeys:i===0?2:4,expectedKeys:i===0?{P:1,A:1}:{P:.2,A:3.8}}]))]));
 const result=publish.aggregateLoads(tracks);assert.ok(Math.abs(result.meanKeys-22/6)<1e-12);assert.ok(Math.abs(result.rightPinky-(2/6)/(22/6))<1e-12);assert.equal(result.rightPinkyPeak,.5);assert.ok(Math.abs(Object.values(result.keys).reduce((a,b)=>a+b,0)-1)<1e-12);
 const summarized=publish.summarizeLoad([{weight:2,code:'PAA'},{weight:1,code:'PP'}],{meanKeys:8/3});assert.equal(summarized.expectedKeys.P,4/3);assert.equal(summarized.meanKeys,8/3);
});
test('publication table labels robust and point-optimal costs separately and escapes scheme labels',()=>{
 const html=publish.tableHtml([{id:'x',label:'<test>',M:41,score:9.5,two:9.4,optimal1:9.3,optimal2:9.2,rightPinky:.065,rightPinkyPeak:.075,policies:{keytao:'12/213/24',sanpin:'12/213/23'}}]);assert.ok(html.includes('&lt;test&gt;'));assert.ok(html.includes('稳健辅序 1倍'));assert.ok(html.includes('1倍点最优'));assert.ok(html.includes('6.50%'));assert.ok(html.includes('data-ux-pick="x"'));assert.ok(html.includes('不含空格'));
});
