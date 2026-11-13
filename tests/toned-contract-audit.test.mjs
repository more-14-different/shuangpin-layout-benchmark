import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import test from 'node:test';
const require=createRequire(import.meta.url);
const {tonedMemoryAudit}=require('../tools/toned_memory_audit');
const {shapeWordStages,pureShapeModernRows}=require('../tools/score_toned_benchmark_columns');
const {snowKeyboardEntry}=require('../tools/snow_jiandao_toned_view');
const {tonedRowsFor}=require('../tools/toned_benchmark_metrics');
const {toneKeysFromShapeKeys,shapeKeysFromToneKeys}=require('../tools/auxiliary_semantics');

test('shape-only word paths respect each domains auxiliary order and four-code routing',()=>{
  const data={shapes:{snowshape:{甲:'A',乙:'E',丙:'U',丁:'I'}}};
  const n21={contract:{capacity:[21,21],toneKeysByTone:'IVUAO',wordAuxiliaryPolicy:{word2:'12',word3:'213',word4:'24'}}};
  const n26={contract:{capacity:[21,26],toneKeysByTone:'IEUAO',wordAuxiliaryPolicy:{word2:'21',word3:'12',word4:'24'}}};
  assert.deepEqual(shapeWordStages('ABCD','甲乙',n21,data),[['ABCD'],['ABCDA'],['ABCDAV']]);
  assert.deepEqual(shapeWordStages('ABCD','甲乙',n26,data),[['ABCD'],['ABCDE'],['ABCDEA']]);
  const row={id:'word3:0',text:'甲乙丙',kind:'word3',weight:1,baseLength:4,stages:[{codes:['BCD']},{codes:['BCDX']},{codes:['BCDXO']},{codes:['BCDXOI']}]};
  const actual=pureShapeModernRows([row],n26,data)[0];
  assert.deepEqual(actual.stages.map(stage=>stage.codes[0]),['BCD','BCDX','BCDXA','BCDXAE']);
  assert.deepEqual(actual.stages.map(stage=>stage.pool),['word3:three','word:four','word:five','word:six']);
  assert.deepEqual(shapeWordStages('BCD','甲乙丙',n21,data),[['BCD'],['BCDV'],['BCDVA']]);
  assert.deepEqual(shapeWordStages('BCDE','甲乙丙丁',n26,data),[['BCDE'],['BCDEE'],['BCDEEI']]);
  for(const n of [n21,n26])assert.equal(toneKeysFromShapeKeys(shapeKeysFromToneKeys(n.contract.toneKeysByTone)),n.contract.toneKeysByTone);
});

test('W/Y legacy spelling is normalized to zero-carrier semantics before link coloring',()=>{
  const entry=snowKeyboardEntry({id:'n',name:'n',contract:{toneKeysByTone:'IEUAO'},keyboards:{firstByKey:{J:['j','w'],W:['y']},secondByKey:{}}});
  assert.deepEqual(entry.roles,{J:['j','ØW'],W:['ØY']});
});

test('current-environment native order resolves the actual two-word shape policy',()=>{
  const data={pinyin:['jia','yi'],characters:[],words:[['甲乙',0,1,1,1,1,1,1]]};
  const make=(capacity,word2)=>({tonedCodes:[['JQ'],['YW']],contract:{capacity,wordAuxiliaryPolicy:{word2}}});
  for(const [capacity,policy,expected] of [[[21,21],'12','JQYWAV'],[[21,26],'21','JQYWVA']]){
    const native=make(capacity,policy),rows=tonedRowsFor(data,native,{dataset:'words',contract:'X2',order:'native'},{甲:'A',乙:'V'});
    assert.equal(rows[0].code,expected);
  }
});

test('derived M lower/upper reproduces existing 21x21 ledgers and covers moved W/Y in 21x26', {skip:!existsSync('a7_CKT_R11.html')},()=>{
  const data=require('../tools/score_completion_ckt_v4').loadPayload('a7_CKT_R11.html');
  const decomposition=require('../research/config/ckt-v51-toned-2121-seeds.json').decomposition;
  const natives=[data.tonedContractBenchmark.schemes.snowJiandao,...Object.values(data.tonedContractBenchmark.schemes.research)];
  const expected={'SNOW-JIANDAO-TONED':[21,23],'CR0-0374':[22,24],'CR1-0004':[21,24],'CR1-0009':[21,24],'CR1-1036':[22,24],
    'T2126-QEMPTY-8890382':[20,23],'T2126-FULL26-8871530':[19,22]};
  for(const native of natives){
    const memory=tonedMemoryAudit(native,data.pinyin,decomposition);
    assert.deepEqual([memory.lower,memory.guard],expected[native.id],native.id);
    assert.equal(memory.audit.groups.flatMap(group=>group.roots).length,18);
    if(native.id.startsWith('T2126'))assert.deepEqual(memory.audit.carrierMoves,[{name:'zero-W',key:'J'},{name:'zero-Y',key:'W'}]);
    else assert.equal(memory.audit.carrierMoves.length,0);
  }
});
