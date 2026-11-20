import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {tableHtml,extractCandidates}=require('../tools/finalize_u7e_pinky_r11');
const {auxiliarySemantics,toneKeysFromShapeKeys}=require('../tools/auxiliary_semantics');
test('candidate packet retains nested native maps and composite benchmark keys without other schemes',()=>{
 const source={entries:[{id:'a',tone:'IVUAO'},{id:'b'}],ckt:{tracks:{a:{S2:1},b:{S2:2}}},pair:{values:{'a|character':{x:3},'b|character':{x:4}}},misc:{unrelated:1}};
 const result=extractCandidates(source,['a']);assert.deepEqual(result,{entries:[{id:'a',tone:'IVUAO'}],ckt:{tracks:{a:{S2:1}}},pair:{values:{'a|character':{x:3}}}});
 const sem=auxiliarySemantics(result.entries[0].tone);assert.equal(sem.shapeKeysByMeaning,'AVUIO');assert.equal(sem.toneDigitsByShapeMeaning,'42310');assert.equal(toneKeysFromShapeKeys(sem.shapeKeysByMeaning),result.entries[0].tone);
 result.ckt.tracks.a.S2=9;assert.equal(source.ckt.tracks.a.S2,1);
});
test('frontier table shows four fixed-policy costs and separate point optima with escaped names',()=>{
 const html=tableHtml([{id:'a',label:'<layout>',M:41,score:9.56,two:9.54,three:9.53,five:9.51,optimal1:9.55,optimal2:9.53,rightPinky:.0389,rightPinkyPeak:.046,policies:{keytao:'12/231/23',sanpin:'12/213/23'}}]);
 assert.ok(html.includes('&lt;layout&gt;'));assert.ok(html.includes('稳健3倍'));assert.ok(html.includes('稳健5倍'));assert.ok(html.includes('data-pinky-cost="five">9.510000000'));assert.ok(html.includes('1倍点最优'));assert.ok(html.includes('3.8900%'));assert.ok(html.includes('data-ux-pick="a"'));
});
