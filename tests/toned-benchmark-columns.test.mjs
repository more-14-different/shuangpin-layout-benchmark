import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {tonedRowsFor, tonedSoundRows, tonedGeneralizedScore, tonedCompletionTime, TONED_BENCHMARK_TRACKS} = require('../tools/toned_benchmark_metrics.js');
const {stripEmbeddedTone, independentCompletion, loadEngines, normalizeLegacy, soundCompletion, v2Motor} = require('../tools/score_toned_benchmark_columns.js');
const {toneRuleMetrics} = require('../tools/toned_rule_metrics.js');
const fixture = () => ({
  data: {pinyin: ['jia','yi'], base: [[0,80],[1,20]], characters: [['甲',0,1,30,1],['贾',0,3,10,1],['乙',1,2,10,1]], words: [['甲乙',0,1,1,2,9,1,1]], reference: {}},
  native: {id:'test', tonedCodes:[['JQ',null,'JF',null,null],[null,'YH',null,null,null]], contract:{shapeKeysByMeaning:'AVUIO',toneKeysByTone:'IVUAO'}},
});
const shapes = {甲:'AV',贾:'UI',乙:'OI'};

test('S2 tone weights preserve each pinyin mass and condition on observed tone frequency', () => {
  const {data,native} = fixture(), rows = tonedSoundRows(data,native);
  assert.deepEqual(rows.map(row=>[row.text,row.w,row.code]), [['jia1',60,'JQ'],['jia3',20,'JF'],['yi2',20,'YH']]);
  assert.equal(rows.reduce((sum,row)=>sum+row.w,0), 100);
});

test('20-contract adapter encodes tone once while preserving requested shape evidence and ordering', () => {
  const {data,native} = fixture();
  const rows = (dataset,contract,order='12') => tonedRowsFor(data,native,{dataset,contract,order},shapes);
  assert.deepEqual(rows('chars','P').map(row=>row.code), ['JQ','JF','YH']);
  assert.deepEqual(rows('chars','T').map(row=>row.code), ['JQ','JF','YH']);
  assert.deepEqual(rows('chars','TX2').map(row=>row.code), ['JQAV','JFUI','YHOI']);
  assert.deepEqual(rows('chars','T1').map(row=>row.code), ['JQA','JFU','YHO']);
  assert.equal(rows('words','T')[0].code,'JQYH');
  assert.equal(rows('words','X2','12')[0].code,'JQYHAO');
  assert.equal(rows('words','X2','21')[0].code,'JQYHOA');
  assert.equal(rows('words','T1')[0].code,'JQAYHO');
});

test('only full-syllable sanpin stages lose their redundant tone strokes', () => {
  assert.deepEqual(stripEmbeddedTone([['AB'],['ABI'],['ABIV','ABIA']],'character'), [['AB'],['AB'],['ABV','ABA']]);
  assert.deepEqual(stripEmbeddedTone([['ABCD'],['ABCDI'],['ABCDIV']],'word2'), [['ABCD'],['ABCD'],['ABCD']]);
  const abbreviated = [['ABC'],['ABCI'],['ABCIV']];
  assert.deepEqual(stripEmbeddedTone(abbreviated,'word3'), abbreviated);
  assert.deepEqual(stripEmbeddedTone(abbreviated,'word4'), abbreviated);
});

test('embedded information stages do not incur phantom auxiliary keys or penalties', () => {
  const result = independentCompletion([
    {text:'甲乙',weight:3,codes:[['ABCD'],['ABCD'],['ABCD']]},
    {text:'丙丁',weight:1,codes:[['ABCD'],['ABCD'],['ABCD']]},
  ], code=>({upperMs:code.length*10}),4,(a,b)=>a.localeCompare(b));
  assert.equal(result.meanKeys,4);
  assert.equal(result.firstAuxRate,0);assert.equal(result.secondAuxRate,0);
  assert.equal(result.p2,.25);
  assert.equal(tonedCompletionTime(result,200,300,400),90);
});

test('normalization keeps the version-specific reference and original weighted power mean', () => {
  assert.equal(tonedGeneralizedScore([{value:30,reference:30,weight:1},{value:50,reference:50,weight:3}]),10);
  assert.equal(tonedGeneralizedScore([{value:60,reference:30,weight:1},{value:100,reference:50,weight:3}]),20);
  assert.throws(()=>tonedGeneralizedScore([{value:NaN,reference:50,weight:1}]),/Invalid/);
});

test('V preserves the original j/q/x/Y umlaut boundary instead of counting ju as u', () => {
  const rules=toneRuleMetrics({pinyin:['ju','wu'],logicUniformity:{supportPartitions:[]}},[
    {py:0,w:1,tone:1,code:'JV'},{py:1,w:1,tone:1,code:'WU'},
  ]);
  assert.deepEqual(rules.vowels.find(row=>row.vowel==='u').keys,['U']);
});

test('S2 rule completion counts code buckets over syllables, never over keyboard capacity', () => {
  const {data,native} = fixture();
  native.tonedCodes[0][2]='JQ';
  const metric = soundCompletion(data,native,code=>({upperMs:code.length}), (a,b)=>a.localeCompare(b));
  assert.equal(metric.uniqueCodes,2);assert.equal(metric.syllables,3);
  assert.equal(metric.meanKeys,2.8);
  assert.equal(metric.extendedWeight,.8);
});

const htmlPath = new URL('../a7_CKT_R11.html',import.meta.url);
test('the original engine and frozen A7E/LU/FA formulas reproduce an untoned reference', {skip:!existsSync(htmlPath)},()=>{
  const data = require('../tools/score_completion_ckt_v4.js').loadPayload(htmlPath);
  const engine = loadEngines(readFileSync(htmlPath,'utf8'),data), entry = data.entries.find(row=>row.id==='S005');
  const tracks = {}, quick = {};
  for(const [name,spec] of Object.entries(TONED_BENCHMARK_TRACKS)) {
    const opt = {...spec,cohort:'common',boundary:'none',model:'ckt',confirm:0};
    const value = engine.CKTEngine.evaluate({...entry,id:'fresh:'+entry.id},opt);
    tracks[name]=value;
    assert.ok(Math.abs(value.upperMs-data.ckt.tracks.S005[name].upperMs)<1e-9,name);
    const aggregate = engine.Engine7.aggregate(engine.Engine7.rowsFor(entry,opt),{...opt,boundary:'iid'});
    quick[name]={e34:engine.Engine7.project(aggregate,engine.Engine7.costs('e34')).eq,geometry:engine.Engine7.project(aggregate,engine.Engine7.costs('geometry')).eq};
  }
  for(const name of ['ensemble','ensembleV2','ensembleV3','ensembleV4']) assert.ok(Math.abs(normalizeLegacy(quick,data[name],true)-data[name].values.S005.score)<1e-9,name);
  assert.ok(Math.abs(normalizeLegacy(tracks,data.ensembleV5)-data.ensembleV5.values.S005.score)<1e-9);
  const sound = data.base.map(([py,w])=>({py,w,tone:1,code:entry.codeList[py]}));
  const rules=toneRuleMetrics(data,sound);
  assert.ok(Math.abs(rules.lu.score-entry.logicUniformity.score)<1e-9,`LU ${rules.lu.score} != ${entry.logicUniformity.score}`);
  assert.ok(Math.abs(rules.fa.score-data.finalSelection.factorAuditValues.S005.score)<1e-9);
  // Independent stopping/ranking must also reproduce the frozen ordinary
  // completion metrics before applying any tone-in-main transformation.
  const snow='D:/C2D/Documents/rime-snow-pinyin';
  if(existsSync(join(snow,'scripts/research/score_shenyun_completion_ckt.js'))) {
    const scorer=require('../tools/score_completion_ckt_v4.js');
    const alternatives=scorer.strokeOptions(join(snow,'rime-stroke/stroke.dict.yaml'));
    const stroke={alternatives,primary:new Map([...alternatives].map(([char,keys])=>[char,[...keys][0]]))};
    const rows=require(join(snow,'scripts/research/score_shenyun_completion_ckt.js')).makeRows(data,entry,stroke,'native');
    const motors={completionB:engine.CKTEngine.codeCost,completionBV2:v2Motor(data)};
    for(const [version,motor] of Object.entries(motors)) for(const mode of ['keytao','sanpin']) for(const [kind,items] of [['character',rows.chars],['word',rows.words]]) {
      const metric=independentCompletion(items.filter(row=>row.common).map(row=>({...row,codes:row[mode]})),motor,kind==='character'?2:4,engine.Engine7.lex);
      const expected=data[version].schemes.S005.modes[mode][kind];
      for(const field of ['completionUpperMs','meanKeys','p0','p1','p2']) assert.ok(Math.abs(metric[field]-expected[field])<1e-8,`${version}/${mode}/${kind}/${field}: ${metric[field]} != ${expected[field]}`);
    }
  }
});
