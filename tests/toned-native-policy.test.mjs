import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
const require=createRequire(import.meta.url);
const {validateWordAuxiliaryPolicy,evaluateLayoutPolicy,buildWordRows}=require('../tools/score_toned_2121_ckt_v51');
const {toneKeysFromShapeKeys,shapeKeysFromToneKeys}=require('../tools/auxiliary_semantics');
test('native v5.1 accepts legal distinct shape positions without changing five-key semantics',()=>{
  for(const policy of [{word2:'12',word3:'213',word4:'24'},{word2:'21',word3:'231',word4:'14'},
    {word2:'12',word3:'321',word4:'41'}]){
    assert.equal(validateWordAuxiliaryPolicy(policy),policy);
    assert.equal(toneKeysFromShapeKeys(shapeKeysFromToneKeys('IVUAO')),'IVUAO');
  }
});
test('invalid auxiliary policies are rejected before scoring or filtering rows',()=>{
  for(const policy of [null,{word2:'11',word3:'213',word4:'24'},
    {word2:'12',word3:'21',word4:'24'},{word2:'12',word3:'234',word4:'24'},
    {word2:'12',word3:'213',word4:'45'},{word2:'12',word3:'213',word4:'AA'}])
    assert.throws(()=>evaluateLayoutPolicy({policy}),/invalid native shape auxiliary policy/);
});
test('selected 21/231/14 policy encodes each word position as its actual shape key',()=>{
  const data={pinyin:['jia','yi','bing','ding'],shapes:{snowshape:{甲:'A',乙:'E',丙:'U',丁:'I'}}};
  const inventory={tokenKeys:['jia1','yi1','bing1','ding1']};
  const layout={tonedCodes:['JQ','YQ','BQ','DQ']};
  const words={word2:[{text:'甲乙',py:[0,1],tones:[1,1],weight:1}],
    word3:[{text:'甲乙丙',py:[0,1,2],tones:[1,1,1],weight:1}],
    word4:[{text:'甲乙丙丁',py:[0,1,2,3],tones:[1,1,1,1],weight:1}]};
  const codes=(kind,order)=>buildWordRows(layout,inventory,data,words,'IVUAO',kind,order)[0].stages.map(s=>s.codes[0]);
  assert.deepEqual(codes('word2','21'),['JQYQ','JQYQV','JQYQVA']);
  assert.deepEqual(codes('word3','231'),['JYB','JYBV','JYBVU','JYBVUA']);
  assert.deepEqual(codes('word4','14'),['JYBD','JYBDA','JYBDAI']);
});
