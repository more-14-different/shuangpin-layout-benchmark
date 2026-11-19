'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {ROOT,entries,load}=require('./toned_2126_r1_r2_c1_catalog');
const {syncPublicationHtml}=require('./sync_keymap_link_colors');
const digest=x=>crypto.createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const html=path.resolve(process.argv[2]||path.join(ROOT,'../shuangpin-layout-benchmark/a7_CKT_R11.html'));
const dest=path.join(path.dirname(html),'a7_CKT_R11_integrated_materials/toned2126-r1-r2-c1');
const source=fs.readFileSync(html,'utf8'),before=digest(source),at=source.indexOf('<script id="payload"'),start=source.indexOf('>',at)+1,end=source.indexOf('</script>',start);
assert.ok(at>=0&&end>start);
const data=JSON.parse(zlib.gunzipSync(Buffer.from(source.slice(start,end),'base64')));
const pool=data.tonedFilterRowPool;assert.equal(pool.version,1);
const existing=data.tonedContractBenchmark.schemes.research;
const protectedTop=Object.fromEntries(Object.entries(data).filter(([k])=>!['tonedContractBenchmark','tonedFilterRowPool','cktV52'].includes(k)).map(([k,v])=>[k,digest(v)]));
const protectedSchemes=Object.fromEntries(Object.entries(existing).filter(([id])=>!Object.values(entries).some(e=>e.id===id)).map(([id,v])=>[id,digest(v)]));
const protectedV52=Object.fromEntries(Object.entries(data.cktV52.schemes).filter(([id])=>!Object.values(entries).some(e=>e.id===id)).map(([id,v])=>[id,digest(v)]));
const originalPoolCount=pool.rows.length,originalPoolHash=digest(pool.rows);
const index=new Map(pool.rows.map((row,i)=>[JSON.stringify(row),i]));const published=[];
for(const key of Object.keys(entries)){
 const publication=load(key),raw=JSON.parse(fs.readFileSync(path.join(dest,key+'.json'),'utf8')),native=raw.native;
 assert.equal(native.id,publication.id);assert.deepEqual(native.contract.wordAuxiliaryPolicy,publication.policy);
 assert.deepEqual(data.pinyin,raw.fixture.pinyin);assert.ok(native.columns&&native.macro&&native.columns.collision);
 assert.ok(Math.abs(native.ckt.v52.score-publication.score)<1e-9);assert.equal(native.memory.lower,18);assert.equal(native.memory.guard,21);assert.equal(native.memory.D,2);
 const packed=native.filterRows.map(([text,reading,main,terminal,weight,kind])=>{
  const descriptor=[text,reading,weight,kind],signature=JSON.stringify(descriptor);let i=index.get(signature);
  if(i===undefined){i=pool.rows.length;pool.rows.push(descriptor);index.set(signature,i)}
  return [i,main,terminal];
 });
 assert.equal(packed.length,289644);native.filterRowsPacked={version:1,rows:packed};delete native.filterRows;
 existing[native.id]=native;data.cktV52.schemes[native.id]=raw.v52Record;
 published.push({key,id:native.id,name:native.name,policy:publication.policy,source:publication.source,sourceSha256:native.publication.sourceSha256,
  memory:native.memory,inventory:native.inventory,ckt:native.ckt,ergonomics:native.ergonomics,columns:native.columns,macro:native.macro,filterRows:packed.length});
}
assert.equal(digest(pool.rows.slice(0,originalPoolCount)),originalPoolHash);
for(const [id,hash] of Object.entries(protectedSchemes))assert.equal(digest(existing[id]),hash,'unrelated toned scheme '+id);
for(const [id,hash] of Object.entries(protectedV52))assert.equal(digest(data.cktV52.schemes[id]),hash,'unrelated v52 '+id);
for(const [key,hash] of Object.entries(protectedTop))assert.equal(digest(data[key]),hash,'unrelated payload '+key);
const records=Object.values(data.cktV52.schemes);data.cktV52.counts={...data.cktV52.counts,toned:records.filter(r=>r.kind==='tone-in-main').length,total:records.length};
let ui=source.slice(0,start)+'__TONED_R1_R2_C1_PAYLOAD__'+source.slice(end);
const marker='/* TONED_2126_R1_R2_C1_DETAIL_START */',stop='/* TONED_2126_R1_R2_C1_DETAIL_END */';
const script=fs.readFileSync(path.join(ROOT,'tools/toned_2126_r1_r2_c1_ui.js'),'utf8');
if(ui.includes(marker)){
 const a=ui.indexOf(marker),b=ui.indexOf(stop,a)+stop.length;ui=ui.slice(0,a)+script+ui.slice(b);
}else{
 const bodyEnd=ui.lastIndexOf('</body>');assert.ok(bodyEnd>0);ui=ui.slice(0,bodyEnd)+'<script>\n'+script+'\n</script>\n'+ui.slice(bodyEnd);
}
ui=syncPublicationHtml(ui);
const json=JSON.stringify(data);assert.ok(Buffer.byteLength(json)<500000000,'decoded payload exceeds conservative browser string budget');
const output=ui.replace('__TONED_R1_R2_C1_PAYLOAD__',zlib.gzipSync(json,{mtime:0}).toString('base64'));
assert.equal(digest(fs.readFileSync(html)),before,'HTML changed concurrently; rerun against current file');
const backup=path.join(dest,'before-'+before.slice(0,12)+'.html');if(!fs.existsSync(backup))fs.copyFileSync(html,backup);
const temporary=html+'.r1-r2-c1.tmp';fs.writeFileSync(temporary,output);fs.renameSync(temporary,html);
const audit={version:1,html,beforeSha256:before,afterSha256:digest(output),decodedPayloadBytes:Buffer.byteLength(json),
 preservedResearchSchemes:Object.keys(protectedSchemes).length,preservedV52Schemes:Object.keys(protectedV52).length,preservedTopLevelSections:Object.keys(protectedTop).length,
 sharedDescriptorsBefore:originalPoolCount,sharedDescriptorsAfter:pool.rows.length,published};
fs.writeFileSync(path.join(ROOT,'research/notes/2026-11-19-toned-2126-r1-r2-c1-r11.json'),JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify({html,ids:published.map(r=>r.id),decodedPayloadBytes:audit.decodedPayloadBytes,preservedResearchSchemes:audit.preservedResearchSchemes}));
