#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {ALPHABET,HEADS,FINALS,splitPinyin}=require('./ckt_v4_scheme_fixture');
const scorer=require('./score_completion_ckt_v4'),model=require('./ckt_v4_model');
const {contractSourceFiles}=require('./close_untoned_2126_double_empty');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const KINDS=['character','word2','word3','word4'];
const POLICIES={keytao:{word2:'12',word3:'12',word4:'24'},sanpin:{word2:'12',word3:'21',word4:'13'}};
function compileRows(rows,words,data,entry) {
  const pools=new Map(['char:base','char:aux1','char:aux2','word:four','word:five','word:six','word3:three'].map((p,i)=>[p,i]));
  const priority=[...rows].sort((a,b)=>b.weight-a.weight||(a.id<b.id?-1:a.id>b.id?1:0));
  const ties=new Map(priority.map((r,i)=>[r.id,i]));
  const syllable=p=> {const [h,f]=splitPinyin(data.pinyin[p]);return h===255||f===255?[...entry.codeList[p]].map(k=>62+ALPHABET.indexOf(k)):[h,27+f];};
  return rows.map(row=> {
    let prefix;
    if(row.kind==='character')prefix=syllable(Number(row.id.slice(row.id.lastIndexOf(':')+1)));
    else {
      const i=Number(row.id.slice(row.id.lastIndexOf(':')+1)),item=words[row.kind][i],pairs=item.py.map(syllable);
      prefix=row.kind==='word2'?pairs.flat():row.kind==='word3'?[...pairs.map(p=>p[0]),pairs[2][1]]:pairs.map(p=>p[0]);
    }
    const stages=row.stages.map(stage=> {
      const count=Math.min(prefix.length,stage.length);
      return [stage.order,pools.get(stage.pool),stage.codes.map(code=>[...prefix.slice(0,count),...[...code.slice(count)].map(k=>62+ALPHABET.indexOf(k))])];
    });
    for(let i=0;i<stages.length;i++)for(let j=0;j<stages[i][2].length;j++) {
      const layout=[...HEADS.map(h=>entry.initialMap[h]),...FINALS.map(f=>entry.finalMap[f])];
      const decoded=stages[i][2][j].map(t=>t<62?layout[t]:ALPHABET[t-62]).join('');
      if(decoded!==row.stages[i].codes[j])throw Error(`Row template mismatch ${row.id}`);
    }
    return [ties.get(row.id),KINDS.indexOf(row.kind),row.weight,row.baseLength,stages];
  });
}
function main() {
  const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].slice(2)]=process.argv[i+1];
  const snow=path.resolve(args.snow||'D:/C2D/Documents/rime-snow-pinyin');
  const html=path.join(ROOT,'a7_CKT_R11.html'),fixture=path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json');
  const seed=path.join(ROOT,'research/config/untoned-2126-double-empty-closure-finalist.json');
  const output=path.resolve(args.output||path.join(ROOT,'research/.cache/untoned-v51-templates.json'));
  const data=scorer.loadPayload(html),entry=data.entries.find(e=>e.id==='SNOW-SHENYUN-21X26-D3V1-BALANCED');
  const words=scorer.multiwords(path.join(snow,'snow_pinyin.base.dict.yaml'),data,.99),strokes=scorer.strokeOptions(path.join(snow,'rime-stroke/stroke.dict.yaml'));
  const {buildRowsForOrder}=require(path.join(snow,'scripts/research/evaluate_ckt_v4_word_aux_order.js'));
  const {buildExtendedWord3Rows,summarize}=require(path.join(snow,'scripts/research/evaluate_ckt51_aux_order.js'));
  const snapshot=read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'));
  const motor=model.projectedMotor(model.upstreamMotor(snapshot),snapshot.keys,data.ckt.calibration.extension_maps);
  const referenceEntry=data.entries.find(e=>e.id==='S005'),modes=[],references=[];
  for(const mode of ['keytao','sanpin']) {
    const character=scorer.buildRows(entry,data,strokes,{word2:[],word3:[],word4:[]},mode);
    const rows=[...character,...Object.entries(POLICIES[mode]).flatMap(([kind,order])=>buildRowsForOrder(entry,data,words,mode,entry.tone,kind,order,model))];
    modes.push(compileRows(rows,words,data,entry));
    const refRows=scorer.buildRows(referenceEntry,data,strokes,{word2:[],word3:[],word4:[]},mode);
    const char=summarize(model.resolveCompetition(refRows,{motorCost:motor}));
    const w2=buildRowsForOrder(referenceEntry,data,words,mode,referenceEntry.tone,'word2','12',model);
    const w4=buildRowsForOrder(referenceEntry,data,words,mode,referenceEntry.tone,'word4',mode==='keytao'?'24':'23',model);
    const pair=model.resolveCompetition([...w2,...w4],{motorCost:motor});
    const w3=buildExtendedWord3Rows(referenceEntry,data,words,mode,referenceEntry.tone,'213');
    references.push([char.effectiveMs,summarize(pair.filter(r=>r.kind==='word2')).effectiveMs,summarize(model.resolveCompetition(w3,{motorCost:motor})).effectiveMs,summarize(pair.filter(r=>r.kind==='word4')).effectiveMs]);
    process.stderr.write(`compiled ${mode}: ${rows.length} rows\n`);
  }
  const sourceFiles=[...contractSourceFiles({snow,html,fixture,seed}),__filename];
  const sourceHashes=Object.fromEntries(sourceFiles.map(p=>[p,hash(p)]));
  const payload={version:'untoned-v51-physical-row-templates-1',keyAlphabet:ALPHABET,policies:POLICIES,shapeKeysByMeaning:'AEUIO',toneKeysByTone:'IEUAO',toneDigitsByShapeMeaning:'42310',references,sourceHashes,modes};
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(payload));
  console.log(JSON.stringify({output,sha256:hash(output),rows:modes.map(m=>m.length),references}));
}
if(require.main===module)main();
module.exports={compileRows};
