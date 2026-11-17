'use strict';
// Independent full CKT and code-derived M-T1 anchors before the column scorers.
const fs=require('node:fs'),path=require('node:path');
const scorer=require('./score_completion_ckt_v4'),toned=require('./score_toned_2121_ckt_v51');
const native=require('./score_snow_jiandao_toned_benchmark'),{tonedMemoryAudit}=require('./toned_memory_audit');
const {toneKeysFromShapeKeys,shapeKeysFromToneKeys}=require('./auxiliary_semantics');
const dir='research/.cache/cr-lan-zero-carriers-20261118';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),manifest=read(dir+'/inputs.json');
const data=scorer.loadPayload('a7_CKT_R11.html');delete data.tonedContractBenchmark;
const snow='D:/C2D/Documents/rime-snow-pinyin',words=scorer.multiwords(path.join(snow,'snow_pinyin.base.dict.yaml'),data,.99);
const strokes=scorer.strokeOptions(path.join(snow,'rime-stroke/stroke.dict.yaml'));
const motor=toned.projectedMotor(data),reference=toned.buildReference({data,words,strokes,motor,snow});
const decomposition=require('../research/config/ckt-v51-toned-2121-seeds.json').decomposition;
for(const row of [{id:manifest.baseline},...manifest.variants]){
  const file=dir+'/'+row.id+'.fixture.json',fixture=read(file),adapted=native.fixtureAdapter(fixture,data);
  if(toneKeysFromShapeKeys(fixture.shapeKeysByMeaning)!==fixture.toneKeysByTone||
     shapeKeysFromToneKeys(fixture.toneKeysByTone)!==fixture.shapeKeysByMeaning)throw Error('auxiliary round trip');
  const memory=tonedMemoryAudit(fixture,fixture.pinyin,decomposition);
  if(memory.lower!==fixture.publication.memoryAudit.memoryLower||memory.guard!==fixture.publication.memoryAudit.memoryGuard)
    throw Error('derived memory mismatch');
  const evaluated=toned.evaluateLayoutPolicy({layout:adapted.layout,layouts:adapted.inventory,data,words,motor,reference,
    shapeKeysByMeaning:fixture.shapeKeysByMeaning,policy:manifest.fixedPolicy});
  if(row.id===manifest.baseline&&Math.abs(evaluated.score-fixture.expected.score)>1e-9)throw Error('baseline score mismatch');
  fixture.expected.score=evaluated.score;
  fs.writeFileSync(file,JSON.stringify(fixture,null,2)+'\n');
  console.log(JSON.stringify({id:row.id,score:evaluated.score,M:[memory.lower,memory.guard]}));
}
