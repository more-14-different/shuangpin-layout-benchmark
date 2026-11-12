#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const scorer = require('./score_completion_ckt_v4.js');
const toned = require('./score_toned_2121_ckt_v51.js');
const native = require('./score_snow_jiandao_toned_benchmark.js');
const {shapeKeysFromToneKeys} = require('./auxiliary_semantics.js');
const root = path.resolve(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const prefix = 'research/notes/2026-11-12-toned-representative-benchmark';

function buckets(tokens, codes, common) {
  if (tokens.length !== codes.length || new Set(tokens).size !== 1407) throw new Error('inventory mismatch');
  const map = new Map();
  for (let i = 0; i < tokens.length; i++) {
    if (!map.has(codes[i])) map.set(codes[i], []);
    map.get(codes[i]).push(tokens[i]);
  }
  const sound = 'QWERTYPSDFGHJKLZXCBNM';
  const empty = [...sound].flatMap(a => [...sound].map(b => a + b)).filter(code => !map.has(code));
  const commonCodes = new Set(tokens.flatMap((t, i) => common.has(t) ? [codes[i]] : []));
  return {capacity:441, legalTonedSyllables:tokens.length, occupied:map.size,
    occupancyPercent:100 * map.size / 441, emptyCount:empty.length, emptyBuckets:empty,
    occupiedCommon1237:commonCodes.size, commonOccupancyPercent:100 * commonCodes.size / 441,
    qzSyllables:map.get('QZ') || [], zqSyllables:map.get('ZQ') || [],
    singletonBuckets:[...map.values()].filter(x => x.length === 1).length,
    maxSyllablesPerBucket:Math.max(...[...map.values()].map(x => x.length))};
}

async function main() {
  const html = path.join(root, 'a7_CKT_R11.html');
  const data = scorer.loadPayload(html);
  const snow = 'D:/C2D/Documents/rime-snow-pinyin';
  const words = scorer.multiwords(path.join(snow, 'snow_pinyin.base.dict.yaml'), data, 0.99);
  const strokes = scorer.strokeOptions(path.join(snow, 'rime-stroke/stroke.dict.yaml'));
  const motor = toned.projectedMotor(data);
  const reference = toned.buildReference({data, words, strokes, motor, snow});
  const reference5 = native.v5Reference({data, words, strokes, motor, snow});
  const fixturePath = 'research/.cache/ckt-v51-toned-mars10-D1-final.json';
  const fixture = read(fixturePath);
  const production = data.tonedContractBenchmark.schemes.snowJiandao;
  const adapted = native.fixtureAdapter(fixture, data);
  const items = [{layout:{...adapted.layout, id:'SNOW-JIANDAO-TONED'}, inventory:adapted.inventory,
    label:'HTML生产候选 M21', expected:production.ckt.v51.score,
    memory:{memoryLower:production.memory.lower, memoryGuard:production.memory.guard},
    source:fixturePath, productionMetadata:production.memory}];
  const sources = [
    ['research/notes/2026-11-12-toned-regroup-combine-finalists.json', ['G2-0000','G2-0004','G2-0002','G2-0013','G2-0012']],
    ['research/notes/2026-11-12-toned-regroup-finalists.json', ['G0-0153','G0-0235','G0-0149']],
    ['research/notes/2026-11-12-toned-rhyme-refine-finalists.json', ['R0463','R0008','R0445']],
    ['research/config/ckt-v51-toned-2121-mars10-qzzq-empty-p3-finalist.json', ['MARS10-QZZQEMPTY-P3-D2-M23-04']],
  ];
  for (const [file, ids] of sources) {
    const inventory = read(file);
    for (const id of ids) {
      const layout = inventory.layouts.find(x => x.id === id);
      if (!layout) throw new Error('missing ' + id);
      items.push({layout, inventory, label:layout.description || id, expected:layout.rustScore,
        memory:layout.memoryAudit, source:file});
    }
  }
  const common = new Set(read('research/config/ckt-v51-toned-2121-seeds.json').auditTokenKeys);
  const results = [];
  for (const item of items) {
    const {layout, inventory} = item;
    const v51 = toned.evaluateLayoutPolicy({layout, layouts:inventory, data, words, motor, reference,
      shapeKeysByMeaning:'AVUIO', policy:{word2:'12',word3:'213',word4:'24'}});
    if (Math.abs(v51.score - item.expected) > 1e-9) throw new Error('score mismatch ' + layout.id);
    if (shapeKeysFromToneKeys(v51.toneKeysByTone) !== 'AVUIO') throw new Error('auxiliary semantic mismatch');
    const v5 = native.evaluateV5({layout, inventory, data, words, motor, reference:reference5, shapeKeysByMeaning:'AVUIO'});
    const byToken = new Map(inventory.tokenKeys.map((t,i) => [t,layout.tonedCodes[i]]));
    const firstKeys = Object.fromEntries(fixture.atoms.map(a => [a.name,
      [...new Set(a.pinyin.flatMap(py => [1,2,3,4,5].flatMap(t => byToken.has(data.pinyin[py]+t) ? [byToken.get(data.pinyin[py]+t)[0]] : [])))]]));
    const ordinary = fixture.atoms.filter(a => a.initial.length === 1 && a.initial !== '_');
    const ordinaryD = ordinary.filter(a => firstKeys[a.name].some(k => k !== a.initial.toUpperCase())).length;
    const ordinaryF = ordinary.reduce((n,a) => n + Math.max(0,firstKeys[a.name].length-1),0);
    const result = {id:layout.id,label:item.label,source:item.source,
      memory:{...item.memory,ordinaryD,ordinaryF},productionMetadata:item.productionMetadata,
      firstKeys, inventory:buckets(inventory.tokenKeys,layout.tonedCodes,common),
      ckt:{v5:{score:v5.score,tracks:v5.tracks},v51:{score:v51.score,tracks:v51.tracks},
        aggregateV51:native.weightedAggregate(v51.tracks,['effectiveMs','motorUpperMs','meanKeys','selectionRate','firstAuxRate','secondAuxRate','thirdAuxRate'])},
      ergonomics:native.loadSummary(v51.outcomes)};
    results.push(result);
    console.log(JSON.stringify({id:result.id,score:v51.score,occupied:result.inventory.occupied,QZ:result.inventory.qzSyllables,ZQ:result.inventory.zqSyllables}));
    fs.writeFileSync(path.join(root,prefix+'.json'), JSON.stringify({version:'toned-representative-benchmark-1',
      contract:{shapeKeysByMeaning:'AVUIO',toneKeysByTone:'IVUAO',toneDigitsByShapeMeaning:'42310',trackWeights:[1,3,1,1],
        v5Policy:'12/21/24',v51Policy:'12/213/24',reference:'S005 keytao-only',macro:'pure main code, no auxiliary or selection'},
      sourceHashes:Object.fromEntries(['a7_CKT_R11.html',fixturePath,...sources.map(x=>x[0])].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')])),
      htmlProduction:{id:production.id,layoutId:production.layoutId,memory:production.memory,inventory:production.inventory,cktV51:production.ckt.v51.score},results},null,2)+'\n');
  }
  fs.writeFileSync(path.join(root,'research/.cache/toned-representative-macro-input.json'),JSON.stringify({
    data:{pinyin:data.pinyin,characters:data.characters,macroxue:{corpora:data.macroxue.corpora}},
    layouts:items.map(({layout,inventory})=>({id:layout.id,tokenKeys:inventory.tokenKeys,tonedCodes:layout.tonedCodes}))}));
}
if (require.main === module) main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={buckets};
