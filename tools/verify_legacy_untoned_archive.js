'use strict';
// Verify compact legacy archives without loading the 190 MB live HTML or searching.
const fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {HEADS,FINALS,splitPinyin}=require('./ckt_v4_scheme_fixture');
const {auxiliarySemantics}=require('./auxiliary_semantics');
const search=require('./search_untoned_production_v51');
const stream=require('./untoned_v51_stream');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
async function main(){
  const manifestPath=process.argv[2],manifest=read(manifestPath);
  const payload=fs.readFileSync(manifest.database);
  assert.equal(crypto.createHash('sha256').update(payload).digest('hex'),manifest.databaseSha256);
  const {rows}=JSON.parse(zlib.gunzipSync(payload));
  const data=read('research/config/a-locked-rhymes-v52-inputs.json').commonData;
  const references=read('research/notes/2026-11-18-ckt-v52-all-schemes.json').references.v51;
  const pairs=data.pinyin.map(splitPinyin),seen=new Set();let tracks=0,maxScoreDifference=0;
  const memory=manifest.route.includes('21x26')?{M:40,D:3,V:1}:{M:42,D:2,V:5};
  const nativeCandidates=[];
  for(const row of rows){
    assert.ok(!seen.has(row.key));seen.add(row.key);
    const state=Buffer.from(row.key,'base64');assert.equal(state.length,62);
    for(const [i,h] of HEADS.entries())assert.equal(row.initialMap[h],String.fromCharCode(state[i]+65));
    for(const [i,f] of FINALS.entries())assert.equal(row.finalMap[f],String.fromCharCode(state[27+i]+65));
    const sem=auxiliarySemantics(row.toneKeysByTone);
    assert.equal(sem.shapeKeysByMeaning,row.shapeKeysByMeaning);assert.equal(sem.toneDigitsByShapeMeaning,'42310');
    const entry={...row,tone:row.toneKeysByTone,codeList:pairs.map(([h,f])=>h===255||f===255?null:row.initialMap[HEADS[h]]+row.finalMap[FINALS[f]])};
    const audit=search.audit(entry,data);assert.ok(audit.valid);assert.equal(audit.branches,0);assert.equal(audit.qz,false);assert.equal(audit.zq,false);
    for(const [k,v] of Object.entries(memory))assert.ok(audit[k]<=v,`${row.id}: ${k}=${audit[k]}`);
    if(manifest.route.includes('21x26'))assert.equal(audit.unique,399);
    if(row.audit)for(const k of ['M','D','V','unique'])assert.equal(audit[k],row.audit[k],`${row.id}: stale ${k}`);
    if(row.modes){
      let sum=0;
      for(const mode of ['keytao','sanpin'])for(const [kind,weight] of Object.entries({character:1,word2:3,word3:1,word4:1})){
        const t=row.modes[mode][kind];assert.ok(t.count>0&&t.totalWeight>0&&Number.isFinite(t.effectiveMs));
        sum+=weight*(t.effectiveMs/references[mode][kind].effectiveMs)**4;
      }
      const difference=Math.abs(10*(sum/12)**.25-row.score);maxScoreDifference=Math.max(maxScoreDifference,difference);assert.ok(difference<1e-9,`${row.id}: score formula mismatch ${difference}`);tracks++;
      if(row.selectionReasons?.some(r=>r.includes('native replay'))||nativeCandidates.length===0)nativeCandidates.push(row);
    }
  }
  assert.equal(rows.length,manifest.retainedRecords);
  // The physical templates below are frozen v5.1 / IEUAO / 21x26 templates only.
  const native=[];
  if(manifest.route.includes('21x26')){
    const worker=stream.launch();
    try{await worker.ready;for(const row of nativeCandidates){const result=await worker.score({id:row.id,state:[...Buffer.from(row.key,'base64')]});native.push({id:row.id,key:row.key,maxDifference:stream.compare(result,row),score:result.score});}}
    finally{worker.child.stdin.end();}
  }
  const output={passed:true,checkedAt:new Date().toISOString(),rows:rows.length,scoreArithmeticRows:tracks,maxScoreDifference,
    common399Reencoded:true,memoryReaudited:true,auxiliarySemanticsRoundTripped:true,nativeReplays:native,
    scope:'Current retained layouts only; original all-row/trajectory verification is historical evidence.',
    inputs:{commonData:'research/config/a-locked-rhymes-v52-inputs.json',v51Reference:'research/notes/2026-11-18-ckt-v52-all-schemes.json',nativeTemplates:manifest.route.includes('21x26')?{path:stream.defaults.templates,sha256:stream.fileHash(stream.defaults.templates)}:null}};
  fs.writeFileSync(manifestPath.replace('-manifest.json','-verification.json'),JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify({passed:true,rows:rows.length,tracks,nativeReplays:native.length,maxScoreDifference}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
