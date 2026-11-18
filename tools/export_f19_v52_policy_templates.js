'use strict';
// Preserve native cohorts/routes, but retain all word-position shape choices.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const native=require('./score_toned_2121_ckt_v51'),scorer=require('./score_completion_ckt_v4');
const {physicalShape}=require('./auxiliary_semantics');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function main(){
  const fixture=read('research/.cache/cr-lan-fixed-20261117/inputs/fixture.json');
  const spec=read('research/.cache/cr-lan-fixed-20261117/inputs/seeds.json');
  const data=read('a7_CKT_R11_integrated_materials/cr_lan_f19/payload-input.json');
  const words=scorer.multiwords('D:/C2D/Documents/rime-snow-pinyin/snow_pinyin.base.dict.yaml',data,.99);
  const first=[],roots=[],regions=[];
  fixture.atoms.forEach((a,i)=>a.pinyin.forEach(py=>first[py]=i));
  fixture.rhymeAtoms.forEach((a,i)=>a.pinyin.forEach(py=>roots[py]=spec.finalRoots[i]));
  fixture.toneRegions.forEach((r,i)=>r.tones.forEach(t=>regions[t]=i));
  const layout={tonedCodes:[]},bundle={tokenKeys:[]},symbols=[];
  fixture.tonedCodes.forEach((codes,py)=>codes.forEach((code,t)=>{
    if(!code)return;
    const pair=[first[py],26+18*regions[t+1]+roots[py]];
    layout.tonedCodes.push(String.fromCharCode(...pair.map(x=>256+x)));
    bundle.tokenKeys.push(fixture.pinyin[py]+(t+1));symbols.push(pair);
  }));
  let rows=native.buildCharacterRows(layout,bundle,data,'IVUAO');
  for(const [kind,order] of [['word2','21'],['word3','213'],['word4','14']])
    rows=rows.concat(native.buildWordRows(layout,bundle,data,words,'IVUAO',kind,order));
  rows.sort((a,b)=>b.weight-a.weight||(a.id<b.id?-1:1));
  const keyIndex=k=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ;,./'.indexOf(k);
  const packed=new Int32Array(rows.length*11);let offset=0;
  for(const r of rows){
    const kind=['character','word2','word3','word4'].indexOf(r.kind),base=r.stages[0].codes[0];
    const aux=kind===0?[...physicalShape(data.shapes.snowshape[r.text],'IVUAO').slice(0,2)]:
      [...r.text].map(c=>physicalShape(data.shapes.snowshape[c],'IVUAO')[0]);
    packed[offset++]=kind;packed[offset++]=r.weight;packed[offset++]=base.length;
    for(let i=0;i<4;i++)packed[offset++]=i<base.length?base.charCodeAt(i)-256:-1;
    for(let i=0;i<4;i++)packed[offset++]=i<aux.length?keyIndex(aux[i]):-1;
  }
  const directory='research/.cache/f19-v52-audit';fs.mkdirSync(directory,{recursive:true});
  const bytes=Buffer.from(packed.buffer);fs.writeFileSync(path.join(directory,'policy-templates.bin'),bytes);
  fs.writeFileSync(path.join(directory,'policy-templates.json'),JSON.stringify({rows:rows.length,columns:11,
    sha256:crypto.createHash('sha256').update(bytes).digest('hex'),tokenKeys:bundle.tokenKeys,symbols,
    cohortCounts:Object.fromEntries(['character','word2','word3','word4'].map(k=>[k,rows.filter(r=>r.kind===k).length]))})+'\n');
  console.log(JSON.stringify({rows:rows.length,bytes:bytes.length}));
}
if(require.main===module)main();
