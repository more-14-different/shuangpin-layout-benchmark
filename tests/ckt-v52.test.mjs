import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {scoreModes,describe,changedTrack,nativeRows}=require('../tools/score_ckt_v52');
const {cktV52Resolve}=require('../tools/ckt_v52_ui');
const {patchUI}=require('../tools/integrate_ckt_v52');
const kinds=['character','word2','word3','word4'];
const tracks=ms=>Object.fromEntries(kinds.map(k=>[k,{effectiveMs:ms,motorUpperMs:ms-10}]));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);

test('形调各半先按各成员参考归一，再合成四次幂',()=>{
  const modes={keytao:tracks(100),sanpin:tracks(100)},refs={keytao:tracks(100),sanpin:tracks(200)};
  near(scoreModes(modes,refs),10*((1+.5**4)/2)**.25);
  assert.notEqual(scoreModes(modes,refs),10*100/150);
  const d=describe(modes,refs);
  near(d.memberScores.keytao,10);near(d.memberScores.sanpin,5);
  for(const k of kinds){near(d.equalTracks[k].score,d.score);near(d.equalTracks[k].effectiveMs,100)}
  near(scoreModes(refs,refs),10);
});
test('词长权重为1:3:1:1，带调主码只保留原形辅成员',()=>{
  const modes={keytao:tracks(100)},refs={keytao:tracks(100)};
  modes.keytao.word2.effectiveMs=200;
  const d=describe(modes,refs);
  near(d.score,10*((1+3*16+1+1)/6)**.25);
  near(d.aggregate.effectiveMs,150);
  assert.deepEqual(Object.keys(d.memberScores),['keytao']);
  near(d.equalTracks.word2.score,20);
});
test('只替换运动耗时，保留原词长候选与认知合同',()=>{
  const old={effectiveMs:450,motorUpperMs:250,firstAuxRate:.3,selectionRate:.1,totalWeight:123,count:17,meanKeys:5};
  const next=changedTrack(old,240);
  assert.deepEqual(next,{...old,effectiveMs:440,motorUpperMs:240});
  assert.equal(next.effectiveMs-next.motorUpperMs,old.effectiveMs-old.motorUpperMs);
  assert.equal(old.motorUpperMs,250);
});
test('原生压缩终码与原始终码读取一致',()=>{
  const raw=[['甲','jia3','AB','ABCD',20,'character']];
  const data={tonedFilterRowPool:{version:1,rows:[['甲','jia3',20,'character']]}};
  assert.deepEqual([...nativeRows({filterRows:raw},data)],raw);
  assert.deepEqual([...nativeRows({filterRowsPacked:{version:1,rows:[[0,'AB','ABCD']]}},data)],raw);
});
test('无ID静态表通过精确旧分识别方案；歧义拒绝匹配',()=>{
  const r={id:'a',v51:{score:9.123456789},v52:{score:9.2}},publication={schemes:{a:r}};
  assert.equal(cktV52Resolve(publication,['9.123456789'],null,0),r);
  assert.equal(cktV52Resolve(publication,['—'],'a',0),r);
  assert.equal(cktV52Resolve(publication,['—'],null,0),null);
  assert.throws(()=>cktV52Resolve({schemes:{a:r,b:{...r,v52:{score:9.3}}}},['9.123456789'],null,0),/Ambiguous/);
});
test('UI脚本位于真实body末尾，避免插进包含body的导出模板；重复安装不重复列',()=>{
  const fixture=['const exportTemplate=`<body>export</body>`;',
    '({headers,rows,ids,raws}=snowJiandaoProductionTableRows(headers,rows,ids,key,raws));',
    '<th>CKT-T v5.1 ↓</th><th>日常移动手 ↑</th>',
    '<td>${num(i.ckt.v51.score,9)}</td><td>${num(i.macro[',
    "['CKT v5.1',num(i.ckt.v51.score,9),num(q.ckt.v51,9),'各自生产合同；S005=10'],",
    '<strong>${num(i.ckt.v51.score,6)}<small>CKT-T v5.1 ↓</small></strong></div>',
    '</body></html>'].join('\n');
  const patched=patchUI(fixture,'/* ui */');
  assert.ok(patched.indexOf('id="ckt-v52-ui"')>patched.indexOf('export</body>'));
  assert.equal(patchUI(patched,'/* ui */'),patched);
  assert.equal(patched.match(/id="ckt-v52-ui"/g).length,1);
});
test('全部33方案44成员176词长轨，逐轨只改变运动成本且原分可复现',()=>{
  const p=JSON.parse(readFileSync('research/notes/2026-11-18-ckt-v52-all-schemes.json','utf8'));
  assert.equal(Object.keys(p.schemes).length,33);
  let members=0,tracksCount=0;
  for(const r of Object.values(p.schemes)){
    const refs=r.kind==='tone-in-main'?{keytao:p.references.v51.keytao}:p.references.v51;
    const refsNext=r.kind==='tone-in-main'?{keytao:p.references.v52.keytao}:p.references.v52;
    near(scoreModes(r.v51.modes,refs),r.v51.score);near(scoreModes(r.v52.modes,refsNext),r.v52.score);
    if(r.kind==='tone-in-main')assert.deepEqual(Object.keys(r.v52.modes),['keytao']);
    for(const mode of Object.keys(r.v51.modes)){
      members++;
      for(const k of kinds){tracksCount++;
        const old=r.v51.modes[mode][k],next=r.v52.modes[mode][k];
        const {motorUpperMs:om,effectiveMs:oe,...otherOld}=old;
        const {motorUpperMs:nm,effectiveMs:ne,...otherNew}=next;
        assert.deepEqual(otherNew,otherOld,`${r.id}/${mode}/${k}`);
        near(oe-om,ne-nm);assert.ok(Number.isFinite(ne)&&ne>0);
      }
    }
  }
  assert.equal(members,44);assert.equal(tracksCount,176);
});
