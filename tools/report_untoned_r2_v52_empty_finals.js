'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),zlib=require('node:zlib'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),PREFIX='2026-11-20-untoned-r2-empty-finals-v52',read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const search=read(`research/notes/${PREFIX}-search.json`),verified=read(`research/notes/${PREFIX}-verification.json`);
assert.ok(search.completed&&verified.complete&&verified.searchCompleted);assert.equal(search.exactlyScored,verified.exactlyScored);
assert.equal(new Set(search.categories.map(c=>c.name)).size,2);
const original=read('research/notes/2026-11-20-untoned-r2-onsets-v52-verification.json');
const fmt=(v,d=9)=>v.toFixed(d),pct=v=>fmt(100*v,3)+'%';
const keySet=r=>[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].filter((k,i)=>!Object.values(r.finalMap).includes(k)).join('/');
let out=`# 固定 R2 声母：空 Q 韵与 Q/Z 韵双空（2026-11-20）\n\n`;
out+='这里的“空 Q”指韵母位置不使用 Q；“Q/Z 双空”指两个韵母位置均不使用。声母 Q、Z 继续保留，不等同于 Common399 的 QZ/ZQ 两个音节桶为空。本轮也继续检查后者。\n\n';
out+='为直接比较，空 Q 类实际使用其余全部25个韵母键；Q/Z 双空类使用其余全部24个韵母键。其余条件沿用：完整固定 R2 的27个声母/零声母映射、M-R2≤40、D≤3、V≤1、无分支、允许主码重码、Common399全部可编码。\n\n';
out+='完整 CKT v5.2 八轨，形辅/调辅各半，单/二/三/四字权重1:3:1:1。沿用形辅12/12/24、调辅12/21/13，toneKeysByTone=IEUAO、shapeKeysByMeaning=AEUIO，语义配对42310；未重新优化辅序。2倍将候选与S005的三次辅键、选重、拒绝候选扫描、翻页共六项认知延时同时翻倍，运动成本不变。\n\n';
out+='|方案|空韵母键|1倍 CKT↓|2倍 CKT↓|M/D/V|Common399异码|移手↑|S2主行↑|20轨主行下限↑|\n|---|---|---:|---:|---|---:|---:|---:|---:|\n';
for(const [i,b] of search.baselines.entries())out+=`|${i?'C':'A'}|无|${fmt(b.v52[1])}|${fmt(b.v52[2])}|40/3/1|399|—|—|—|\n`;
const names=new Map();for(const c of search.categories)for(const [k,label] of [[c.best1,'1倍最低'],[c.best2,'2倍最低']])names.set(k,[...(names.get(k)||[]),`${c.name}/${label}`]);
for(const r of [...original.verified.filter(r=>r.actualRhymeKeys===25),...verified.verified])out+=`|${r.id}|${keySet(r)}|${fmt(r.score)}|${fmt(r.score2)}|${r.audit.M}/${r.audit.D}/${r.audit.V}|${r.audit.unique}|${fmt(r.erg.mx,6)}|${pct(r.erg.homeS2)}|${pct(r.erg.homeFloor)}|\n`;
out+='\n';
const zRows=original.verified.filter(r=>r.actualRhymeKeys===25),z1=Math.min(...zRows.map(r=>r.score)),z2=Math.min(...zRows.map(r=>r.score2));
for(const c of search.categories){const a=verified.verified.find(r=>r.key===c.best1),b=verified.verified.find(r=>r.key===c.best2);out+=`${c.name} 的已发现最低值：1倍 ${fmt(a.score)}，2倍 ${fmt(b.score2)}；相对上一轮空Z的各自最低值净差 ${fmt(a.score-z1)} / ${fmt(b.score2-z2)}（负值更低，两列可来自不同布局）。\n\n`;}
out+='原生产工效门槛全部通过的最终候选有 '+verified.verified.filter(r=>r.productionAdmissible).length+' 套。CKT的微小优势应连同移手、主行、同指当量和空键需求一起考虑。\n\n';
const refs=read('research/notes/2026-11-18-ckt-v52-all-schemes.json').references.v52;
const scale=(x,m)=>Object.fromEntries(Object.entries(x).map(([mode,tracks])=>[mode,Object.fromEntries(Object.entries(tracks).map(([kind,t])=>[kind,{...t,effectiveMs:t.motorUpperMs+m*(t.effectiveMs-t.motorUpperMs)}]))]));
const at=(r,m)=>require('./score_ckt_v52').scoreModes(scale(r.modesV52,m),scale(refs,m));
for(const r of [...zRows,...verified.verified]){assert.ok(Math.abs(at(r,1)-r.score)<1e-10);assert.ok(Math.abs(at(r,2)-r.score2)<1e-10);}
const qCase=search.categories.find(c=>c.name==='empty-Q-only'),qWinner=verified.verified.find(r=>r.key===qCase.best2);
const delta=m=>at(qWinner,m)-Math.min(...zRows.map(r=>at(r,m))),crossings=[];
for(let i=1;i<=1000;i++){let lo=1+(i-1)/1000,hi=1+i/1000;if(delta(lo)*delta(hi)>=0)continue;const sign=delta(lo)>0;for(let j=0;j<40;j++){const mid=(lo+hi)/2;if((delta(mid)>0)===sign)lo=mid;else hi=mid;}crossings.push((lo+hi)/2);}
if(crossings.length)out+=`仅空Q的2倍成本最低候选，与上一轮两套空Z候选中分数较低者的交点为认知成本统一倍率 ${crossings.map(x=>fmt(x,6)).join('、')}（范围1至2；候选和S005的六项认知成本一起缩放，固定辅策略与终码路由）。这是这几套已发现候选的比较，不代表该倍率下的全局最优布局。\n\n`;
const cBaseline=search.baselines[1];
for(const r of verified.verified){
 out+=`## ${r.id}\n\n${names.get(r.key).join('；')}。实际韵母键数${r.actualRhymeKeys}，空键${keySet(r)}。QZ/ZQ主码桶均为空。\n\n`;
 out+=`对 C 的净差：1倍 ${fmt(r.score-cBaseline.v52[1])}，2倍 ${fmt(r.score2-cBaseline.v52[2])}（负值更低）。A7-E v4=${fmt(r.independent.a7eV4)}，S2 e34=${fmt(r.independent.tracks.S2.e34)}，全部原生产门槛${r.productionAdmissible?'通过':'未通过'}。\n\n`;
 out+='|成员/轨道|运动ms|1倍完整ms|2倍完整ms|第一辅|第二辅|选重|平均拒绝数|翻页动作|\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n';
 for(const m of ['keytao','sanpin'])for(const k of ['character','word2','word3','word4']){const t=r.modesV52[m][k];out+=`|${m}/${k}|${fmt(t.motorUpperMs,6)}|${fmt(t.effectiveMs,6)}|${fmt(2*t.effectiveMs-t.motorUpperMs,6)}|${pct(t.firstAuxRate)}|${pct(t.secondAuxRate)}|${pct(t.selectionRate)}|${fmt(t.meanRejectedCandidates,6)}|${fmt(t.meanPageActions,6)}|\n`;}
 out+='\n韵母映射：'+Object.entries(r.finalMap).map(([f,k])=>`${f}→${k}`).join('，')+'。\n\n';
}
out+=`## 覆盖与验证\n\n复用先前 ${search.priorScored} 个完整评分布局，新精评 ${search.newExactlyScored} 个。新增数量包括断点续跑前的探索结果；下列每轮新评分数按恢复时尚未评分的端点统计，不等于该中心的全部合法邻域大小。两个空韵母分类分别独立修复起点、做两轮换韵扫描；每个已列中心覆盖所有合法单韵母移动、两韵母交换、整键合并与整键交换的不同端点。\n\n`;
for(const c of search.categories)out+=`- ${c.name}：修复池${c.repairPool}，选择${c.selectedRepairSeeds}个新起点；累计分类内精评${c.eligibleScored}个，满足三项原工效下限${c.comfortableScored}个。最终最低点完整一跳已扫描：1倍=${c.oneHopStationary.multiplier1}，2倍=${c.oneHopStationary.multiplier2}。\n`;
out+='\n';for(const p of search.phases)out+=`- ${p.category} 第${p.round}轮：中心1倍${fmt(p.centerScore)}、2倍${fmt(p.centerScore2)}，新评分${p.newScored}。\n`;
out+='\n所有最终候选均由完整JS从原始字词行重建，逐一核对Rust八轨各数值字段（差<1e-7）和1倍/2倍CKT（差<1e-10），并做20轨独立工效审计。这是有限多中心搜索，未证明全局最优；旧工效门槛为移手≥142.321863117、S2主行≥43.912042074%、20轨主行下限≥31.284320948%、A7-E v4≤10.6706358963、S2 e34≤1.32939025936。\n\n';
out+='完整布局与逐轨验证见同名前缀的 verification.json；原搜索及新增评分压缩包的路径与SHA256见 search.json。复算使用 `just r2-empty-finals-v52-search` 与 `just r2-empty-finals-v52-verify`，前置输入与上一轮固定R2实验相同。\n';
// Check every newly archived score belongs to at least one declared class.
const raw=zlib.gunzipSync(fs.readFileSync(path.join(ROOT,search.newScoreArchive.path))).toString('utf8');
const {matches,CASES}=require('./search_untoned_r2_v52_empty_finals');
const newRows=raw.trim().split('\n').map(JSON.parse);assert.equal(newRows.length,search.newExactlyScored);assert.equal(new Set(newRows.map(r=>r.key)).size,newRows.length);
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,search.newScoreArchive.path))).digest('hex'),search.newScoreArchive.sha256);
for(const r of newRows)assert.ok(CASES.some(c=>matches(r.state,c))&&!r.audit.qz&&!r.audit.zq);
const sourceBytes=fs.readFileSync(path.join(ROOT,search.sourceArchive.path));
assert.equal(crypto.createHash('sha256').update(sourceBytes).digest('hex'),search.sourceArchive.sha256);
const priorRows=zlib.gunzipSync(sourceBytes).toString('utf8').trim().split('\n').map(JSON.parse),priorKeys=new Set(priorRows.map(r=>r.key));
assert.equal(priorRows.length,search.priorScored);
for(const r of newRows)assert.ok(!priorKeys.has(r.key),'new scores must not duplicate the original archive');
const allRows=[...priorRows,...newRows];
for(const c of search.categories)assert.equal(allRows.filter(r=>matches(r.state,c)).length,c.eligibleScored);
out+='\n补充：若允许在指定Q或Q/Z之外再空其他韵母键，在本次已评分池中的最低值为：\n\n';
for(const c of search.categories){const rows=allRows.filter(r=>c.forbidden.every(k=>!r.state.slice(27).includes(k)));out+=`- ${c.name} 放宽实际键数：1倍 ${fmt(Math.min(...rows.map(r=>r.score)))}，2倍 ${fmt(Math.min(...rows.map(r=>r.score2)))}。\n`;}
fs.writeFileSync(path.join(ROOT,`research/notes/${PREFIX}-report.md`),out);
console.log(JSON.stringify({verified:verified.verified.length,newScored:search.newExactlyScored}));
