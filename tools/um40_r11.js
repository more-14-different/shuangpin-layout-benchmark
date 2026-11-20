'use strict';
// Native inputs and scores for the three original (QZ empty, ZQ=zen) UM40 layouts.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const scorer=require('./score_completion_ckt_v4'),v52=require('./score_ckt_v52');
const model=require('./ckt_v4_model'),base=require('./search_untoned_t2126_m4_v52');
const {expand}=require('./refine_untoned_t2126_m4_v52');
const {auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),SNOW='D:/C2D/Documents/rime-snow-pinyin';
const IDS=['UM40-dff81aa57dd2','UM40-8acdbdac3fad','UM40-ac9707a932d1'];
const LABELS=['当前方案','偏向 1x','偏向 2x'];
const read=p=>JSON.parse(fs.readFileSync(path.resolve(ROOT,p),'utf8'));
function prepare(html){
  const data=scorer.loadPayload(html),anchor=read('research/config/untoned-m40d3-v52-finalist.json');
  const search=read('research/notes/2026-11-20-um40-fixed-initial-rhymes.json');
  const maps=[anchor,expand(search.bestDefault[0].state),expand(search.bestDoubled[0].state)];
  const comparisons=read('research/notes/2026-11-20-um40-ergonomics-collisions.json').results;
  const template=read('research/.cache/untoned-t2126-m4-20261120/contract.json').inputs.entries[0];
  const {HEADS,FINALS,splitPinyin}=require('./ckt_v4_scheme_fixture');
  return maps.map((map,i)=>{
    const im=map.initialMap,fm=map.finalMap;
    const codeList=data.pinyin.map((py,j)=>{
      if(!template.codeList[j])return null;
      const[h,f]=splitPinyin(py);
      assert.notEqual(h,255,py);assert.notEqual(f,255,py);
      return im[HEADS[h]]+fm[FINALS[f]];
    });
    const comparison=comparisons.find(r=>r.id===IDS[i]);assert.ok(comparison);
    return {id:IDS[i],label:LABELS[i],initialMap:im,finalMap:fm,codeList,expected:comparison.cktV52,comparison};
  });
}
function score(html){
  const data=scorer.loadPayload(html),ctx=v52.context(data,SNOW,path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'));
  const ref=data.entries.find(e=>e.id==='S005'),reference=v52.evaluateUntoned(ref,base.REF,null,ctx);
  const v5ReferencePolicy={keytao:{word2:'12',word3:'21',word4:'24'},sanpin:{word2:'12',word3:'21',word4:'23'}};
  function v5Modes(e,policies){
    return Object.fromEntries(['keytao','sanpin'].map(mode=>{
      const chars=scorer.buildRows(e,data,ctx.strokes,ctx.words,mode).filter(r=>r.kind==='character');
      const words=Object.entries(policies[mode]).flatMap(([kind,order])=>ctx.buildRowsForOrder(e,data,ctx.words,mode,e.tone,kind,order,model));
      const outcomes=model.resolveCompetition([...chars,...words],{motorCost:ctx.legacy});
      return [mode,model.summarizeOutcomes(outcomes,{...model.DEFAULT_COGNITIVE_PRIOR,pageSize:6})];
    }));
  }
  const v5Reference=v5Modes(ref,v5ReferencePolicy),schemes={};
  for(const id of IDS){
    const e=data.entries.find(r=>r.id===id);assert.ok(e,id);
    const value=v52.evaluateUntoned(e,base.POLICY,base.BALANCE,ctx);
    const old=v52.describe(value.v51,reference.v51),next=v52.describe(value.v52,reference.v52);
    const doubled=base.normalize(value.v52,reference.v52,2);
    const expected=e.um40Publication.expected;
    assert.ok(Math.abs(next.score-expected.score)<1e-9,id+' default');
    assert.ok(Math.abs(doubled-expected.doubledScore)<1e-9,id+' doubled');
    const v5=v52.describe(v5Modes(e,base.POLICY),v5Reference);
    schemes[id]={id,name:e.name,kind:'untoned',contract:{capacity:e.capacity,auxiliarySemantics:auxiliarySemantics(e.tone),
      policies:{candidate:base.POLICY,reference:base.REF},lengthBalance:base.BALANCE,routes:value.routes,reference:'S005 each mode separately'},
      v5:{...v5,policies:{candidate:base.POLICY,reference:v5ReferencePolicy}},v51:old,v52:next,
      doubledV52:doubled};
    console.log(JSON.stringify({id,v51:old.score,v52:next.score,doubledV52:doubled}));
  }
  return {version:'um40-original-three-r11-native-scores-v1',schemes};
}
if(require.main===module){
  const[command,html,output]=process.argv.slice(2);
  assert.ok(['prepare','score'].includes(command)&&html&&output,'prepare|score HTML OUTPUT');
  fs.writeFileSync(output,JSON.stringify(command==='prepare'?prepare(html):score(html),null,2)+'\n');
}
module.exports={IDS,LABELS,prepare,score};
