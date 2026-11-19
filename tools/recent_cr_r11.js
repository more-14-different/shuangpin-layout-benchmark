'use strict';
// Preserve the current atlas and append only the explicitly selected native schemes.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const scorer=require('./score_completion_ckt_v4'),toned=require('./score_toned_2121_ckt_v51');
const {fixtureAdapter}=require('./score_snow_jiandao_toned_benchmark');
const {context,evaluateToned,describe,v51Digest}=require('./score_ckt_v52');
const {auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),HTML=path.join(ROOT,'a7_CKT_R11.html');
const DIR=path.join(ROOT,'a7_CKT_R11_integrated_materials/recent_cr_v52');
const PREFIX=path.join(ROOT,'research/notes/2026-11-19-recent-cr-r11');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const close=(a,b,label,tolerance=1e-9)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=tolerance,`${label}: ${a} != ${b}`);
const ctxFor=data=>context(data,'D:/C2D/Documents/rime-snow-pinyin',path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'));

function prepare(){
  const source=read(PREFIX+'-source.json'),before=hash(HTML),data=scorer.loadPayload(HTML);
  for(const [file,expected] of Object.entries(source.sourceHashes))assert.equal(hash(path.join(ROOT,file)),expected,file);
  fs.copyFileSync(HTML,path.join(DIR,'before.html'));
  const ctx=ctxFor(data),reference=toned.buildReference({data,words:ctx.words,strokes:ctx.strokes,motor:ctx.legacy,snow:ctx.snow});
  const prepared={version:'recent-cr-r11-prepared-v1',htmlBeforeSha256:before,ids:Object.keys(source.labels),expectedV51:{}};
  for(const layout of source.layouts){
    const file=path.join(DIR,layout.id+'.fixture.json'),fixture=read(file),adapted=fixtureAdapter(fixture,data);
    const result=toned.evaluateLayoutPolicy({layout:adapted.layout,layouts:adapted.inventory,data,words:ctx.words,
      motor:ctx.legacy,reference,shapeKeysByMeaning:'AVUIO',policy:layout.wordAuxiliaryPolicy});
    fixture.expected.score=result.score;fixture.publication.originalFixedPolicyScore=result.score;
    fixture.publication.policySelection.selectedV51=result.score;
    write(file,fixture);prepared.expectedV51[layout.id]=result.score;
    console.log(JSON.stringify({prepared:layout.id,v51:result.score,expectedV52:layout.recentRefinement.expectedV52}));
  }
  assert.equal(hash(HTML),before,'HTML changed while preparing');write(path.join(DIR,'prepared.json'),prepared);
}

function metricRow(native){
  return {id:native.id,originalId:native.publication.recentRefinement.originalId,route:native.publication.recentRefinement.route,
    policy:native.contract.wordAuxiliaryPolicy,cktV51:native.ckt.v51.score,cktV52:native.ckt.v52.score,
    doubledV52:native.publication.policySelection.doubledV52,M:native.memory.lower,guard:native.memory.guard,D:native.memory.D,
    leftPinky:native.ergonomics.leftPinkyQAZPeak4NativeTracks.value,rightPinky:native.ergonomics.rightPinkyPeak4NativeTracks.value,
    maxFinger:native.ergonomics.maxFingerPeak4NativeTracks.value,sameFingerOther:native.ergonomics.s2DifferentKeySameFingerRate,
    word2Selection:native.ckt.v52.tracks.word2.selectionRate,characterSelection:native.ckt.v52.tracks.character.selectionRate};
}

function packFilterRows(native,data,poolIndex){
  assert.equal(data.tonedFilterRowPool?.version,1,'requires the existing R11 shared row pool');
  native.filterRowsPacked={version:1,rows:native.filterRows.map(row=>{
    const key=JSON.stringify([row[0],row[1],row[4],row[5]]),index=poolIndex.get(key);
    assert.ok(index!==undefined,'new cohort row is absent from frozen shared pool');
    return [index,row[2],row[3]];
  })};
  delete native.filterRows;
}

function publish(recover=false){
  const prepared=read(path.join(DIR,'prepared.json')),source=read(PREFIX+'-source.json');
  if(!recover)assert.equal(hash(HTML),prepared.htmlBeforeSha256,'HTML changed since preparation; rerun prepare before publishing');
  else assert.equal(hash(path.join(DIR,'before.html')),prepared.htmlBeforeSha256,'recovery snapshot changed');
  const currentHash=hash(HTML),data=scorer.loadPayload(recover?path.join(DIR,'before.html'):HTML),ctx=ctxFor(data),publication=data.cktV52;
  const poolIndex=new Map(data.tonedFilterRowPool.rows.map((row,i)=>[JSON.stringify(row),i]));
  const references=publication.references;const oldIds=new Set(Object.keys(publication.schemes));
  const target=data.tonedContractBenchmark.schemes.research;
  const newIds=prepared.ids.filter(id=>!target[id]);
  const added={};
  for(const ident of prepared.ids){
    if(target[ident])assert.equal(target[ident].publication?.recentRefinement?.originalId,source.layouts.find(r=>r.id===ident).recentRefinement.originalId,'ID belongs to another publication');
    const n=read(path.join(DIR,ident+'.benchmark.json')),layout=source.layouts.find(r=>r.id===ident),expected=layout.recentRefinement;
    assert.equal(n.id,ident);assert.deepEqual(n.contract.wordAuxiliaryPolicy,layout.wordAuxiliaryPolicy);
    assert.equal(auxiliarySemantics(n.contract.toneKeysByTone).shapeKeysByMeaning,n.contract.shapeKeysByMeaning);
    close(n.ckt.v51.score,prepared.expectedV51[ident],ident+' v51');
    const codeHash=crypto.createHash('sha256').update(JSON.stringify(n.tonedCodes)).digest('hex');
    assert.equal(n.columns.tonedCodesSha256,codeHash);assert.equal(n.columns.nativeId,ident);
    assert.deepEqual(n.columns.completion.adaptation.wordAuxiliaryPolicy,n.contract.wordAuxiliaryPolicy);
    const value=evaluateToned(n,ctx),v51=describe(value.v51,{keytao:references.v51.keytao}),v52=describe(value.v52,{keytao:references.v52.keytao});
    close(v51.score,n.ckt.v51.score,ident+' native v51');close(v52.score,expected.expectedV52,ident+' native v52');
    for(const kind of ['character','word2','word3','word4'])for(const field of ['motorUpperMs','effectiveMs','firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanKeys'])
      close(v52.modes.keytao[kind][field],expected.expectedTracksV52[kind][field],ident+'/'+kind+'/'+field,1e-7);
    for(const field of ['lower','guard','D','F'])assert.equal(n.memory[field],expected.memory[field]);
    for(const field of ['leftPinkyQAZPeak4NativeTracks','rightPinkyPeak4NativeTracks','maxFingerPeak4NativeTracks'])
      close(n.ergonomics[field].value,expected.expectedErgonomics[field].value,ident+'/'+field,1e-12);
    close(n.ergonomics.s2DifferentKeySameFingerRate,expected.expectedErgonomics.s2DifferentKeySameFingerRate,ident+' same finger',1e-12);
    n.ckt.v52={score:v52.score,policy:n.contract.wordAuxiliaryPolicy,reference:'S005 keytao-only; same v5.1 task; v5.2 long-code errors',tracks:v52.modes.keytao};
    n.ckt.aggregateV52=v52.aggregate;
    // Each of the six cognitive components and the S005 denominator double.
    let sum=0;for(const [kind,weight] of Object.entries({character:1,word2:3,word3:1,word4:1})){
      const t=v52.modes.keytao[kind],r=references.v52.keytao[kind];
      sum+=weight*((2*t.effectiveMs-t.motorUpperMs)/(2*r.effectiveMs-r.motorUpperMs))**4;
    }
    n.publication.policySelection.doubledV52=10*(sum/6)**.25;
    n.publication.validation={anchorsVerified:true,tolerance:1e-9,cktV52IndependentNativeReplay:true};
    added[ident]=n;
    publication.schemes[ident]={id:ident,name:n.name,kind:'tone-in-main',contract:{...n.contract,routes:value.routes,reference:n.ckt.v51.reference},v51,v52};
    write(path.join(DIR,ident+'.benchmark.json'),n);
    packFilterRows(n,data,poolIndex);target[ident]=n;
    console.log(JSON.stringify(metricRow(n)));
  }
  const rows=Object.values(added).map(metricRow),axes=['cktV52','doubledV52','M','guard','rightPinky','maxFinger','sameFingerOther','word2Selection','characterSelection'];
  const dominates=(a,b)=>axes.every(k=>a[k]<=b[k]+1e-12)&&axes.some(k=>a[k]<b[k]-1e-12);
  for(const row of rows)assert.ok(!rows.some(other=>other!==row&&dominates(other,row)),'selected representative dominated: '+row.id);
  publication.extensions??=[];publication.extensions.push({version:'recent-cr-r11-v1',ids:prepared.ids,
    source:'research/notes/2026-11-19-recent-cr-r11-source.json',sourceSha256:hash(PREFIX+'-source.json'),previousV51Digest:publication.v51BeforeDigest});
  publication.counts={...publication.counts,toned:publication.counts.toned+newIds.length,total:publication.counts.total+newIds.length};
  publication.v51BeforeDigest=v51Digest(data);
  const audit={version:'recent-cr-r11-benchmark-v1',ids:prepared.ids,rows,representativeParetoAxes:axes,
    noRepresentativeDominatedOnNamedAxes:true,baselineProductionUnchanged:true,
    sourceHashes:Object.fromEntries([PREFIX+'-source.json',__filename,path.join(ROOT,'tools/integrate_recent_cr_r11.py'),
      path.join(ROOT,'tools/recent_cr_r11_ui.js'),path.join(ROOT,'tools/score_toned_benchmark_columns.js'),
      path.join(ROOT,'tools/score_snow_jiandao_toned_benchmark.js')].map(p=>[path.relative(ROOT,p).replaceAll('\\','/'),hash(p)])),
    schemes:Object.fromEntries(Object.entries(added).map(([id,n])=>[id,Object.fromEntries(Object.entries(n).filter(([k])=>!['filterRows','filterRowsPacked','tonedCodes','keyboards'].includes(k)))]))};
  write(PREFIX+'-columns.json',audit);
  let html=fs.readFileSync(HTML,'utf8'),start=html.indexOf('>',html.indexOf('<script id="payload"'))+1,end=html.indexOf('</script>',start);
  html=html.slice(0,start)+zlib.gzipSync(Buffer.from(JSON.stringify(data)),{mtime:0}).toString('base64')+html.slice(end);
  const ui='<script id="recent-cr-r11-ui">\n'+fs.readFileSync(path.join(ROOT,'tools/recent_cr_r11_ui.js'),'utf8')+'\n</script>\n';
  html=html.replace(/<script id="recent-cr-r11-ui">[\s\S]*?<\/script>\n?/u,'');
  const body=html.lastIndexOf('</body>');assert.ok(body>=0);html=html.slice(0,body)+ui+html.slice(body);
  assert.equal(hash(HTML),currentHash,'HTML changed while integrating');
  fs.writeFileSync(HTML+'.recent.tmp',html);fs.renameSync(HTML+'.recent.tmp',HTML);
  write(path.join(DIR,'manifest.json'),{ids:prepared.ids,newIds,htmlBeforeSha256:prepared.htmlBeforeSha256,htmlAfterSha256:hash(HTML),
    previousSchemeIds:[...oldIds],sourceSha256:hash(PREFIX+'-source.json'),auditSha256:hash(PREFIX+'-columns.json')});
}

if(require.main===module){const mode=process.argv[2];if(mode==='prepare')prepare();else if(mode==='publish')publish();else if(mode==='recover-packed')publish(true);else throw Error('expected prepare, publish or recover-packed');}
module.exports={metricRow,packFilterRows};
