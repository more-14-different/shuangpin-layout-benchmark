'use strict';
const fs=require('node:fs'),path=require('node:path');
const scorer=require('./score_completion_ckt_v4'),model=require('./ckt_v4_model');
const {audit,ergonomics}=require('./untoned_r2_search_metrics');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const search=read('research/notes/2026-11-20-untoned-r2-onsets-v52-search.json'),verification=read('research/notes/2026-11-20-untoned-r2-onsets-v52-verification.json');
if(!search.completed||!verification.searchCompleted||search.exactlyScored!==verification.exactlyScored)throw Error('incomplete or stale verification');
const data=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html')),fixture=read('research/.cache/ckt-v4-ergonomics.json'),motor=model.upstreamMotor(read('tools/ckt_v4_upstream_role_tables.json'));
const fmt=(n,d=9)=>n.toFixed(d),pct=n=>fmt(100*n,3)+'%';
const baselineRows=search.baselines.map((b,i)=>{const e=data.entries.find(e=>e.id===b.id);return {id:i?'C':'A',score:b.v52[1],score2:b.v52[2],actualRhymeKeys:new Set(Object.values(e.finalMap)).size,audit:audit(e,data),erg:ergonomics(e,data,fixture,motor)}});
const names=new Map();
for(const [key,label] of [[search.best1,'容量26：1倍最低'],[search.best2,'容量26：2倍最低'],[search.bestExact26_1,'实际26键：1倍最低'],[search.bestExact26_2,'实际26键：2倍最低']])if(key)names.set(key,[...(names.get(key)||[]),label]);
let out=`# 完整固定 R2 声母的无调 21×26 研究（2026-11-20）\n\n`;
out+=`来源为 HTML 的「${search.sourceName}」（${search.sourceId}）。固定全部 27 个声母/零声母映射，只改韵母。允许主码重码，Common399 必须全部可编码，QZ/ZQ 均为空；M-R2≤40、D≤3、V≤1、无分支。\n\n`;
out+=`完整 CKT v5.2：形辅、调辅各半，单/二/三/四字权重 1:3:1:1，按各自 S005 参考归一后合成四次幂。1倍成本为三次辅键各300ms、选重600ms、每拒绝候选50ms、翻页300ms；2倍将候选与 S005 的这六项同时翻倍，运动成本不变。两列是各自成本情景的归一分，不能直接视为绝对毫秒变化。\n\n`;
out+=`沿用 A/C 的辅策略：形辅 12/12/24，调辅 12/21/13；toneKeysByTone=IEUAO，shapeKeysByMeaning=AEUIO，配对 42310。此轮没有重新枚举辅策略或 120 种物理辅键排列，所报为上述固定辅合同下的最低已发现值。\n\n`;
out+=`## 比较\n\n|方案|实际韵母键位|CKT v5.2·1倍↓|CKT v5.2·2倍↓|M/D/V|Common399异码数|移手↑|S2主行↑|20轨主行下限↑|\n|---|---:|---:|---:|---|---:|---:|---:|---:|\n`;
for(const r of [...baselineRows,...verification.verified])out+=`|${r.id}|${r.actualRhymeKeys}|${fmt(r.score)}|${fmt(r.score2)}|${r.audit.M}/${r.audit.D}/${r.audit.V}|${r.audit.unique}|${fmt(r.erg.mx,6)}|${pct(r.erg.homeS2)}|${pct(r.erg.homeFloor)}|\n`;
out+='\n';
for(const r of verification.verified){
 out+=`### ${r.id}\n\n对应：${(names.get(r.key)||[]).join('；')}。独立完整 JS 重放验证通过，Rust 八轨所有数值字段与 JS 的最大允许差为 1e-7，CKT 差小于 1e-10。\n\n`;
 for(const b of baselineRows)out+=`相对 ${b.id}，1倍净差 ${fmt(r.score-b.score)}，2倍净差 ${fmt(r.score2-b.score2)}（负值表示更低）。\n\n`;
 out+=`独立 A7-E v4=${fmt(r.independent.a7eV4)}，S2 e34=${fmt(r.independent.tracks.S2.e34)}；生产门槛综合判定：${r.productionAdmissible?'通过':'未通过'}。移手/S2主行/20轨主行下限门槛为 142.321863117 / 43.912042074% / 31.284320948%；A7-E v4≤10.6706358963、S2 e34≤1.32939025936。\n\n`;
 out+='|成员/轨道|运动 ms|完整1倍 ms|完整2倍 ms|第一辅|第二辅|第三辅|选重|平均拒绝数|翻页动作|\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
 for(const mode of ['keytao','sanpin'])for(const kind of ['character','word2','word3','word4']){const t=r.modesV52[mode][kind];out+=`|${mode}/${kind}|${fmt(t.motorUpperMs,6)}|${fmt(t.effectiveMs,6)}|${fmt(2*t.effectiveMs-t.motorUpperMs,6)}|${pct(t.firstAuxRate)}|${pct(t.secondAuxRate)}|${pct(t.thirdAuxRate)}|${pct(t.selectionRate)}|${fmt(t.meanRejectedCandidates,6)}|${fmt(t.meanPageActions,6)}|\n`;}
 out+='\n相对 A 的韵母变动：'+Object.entries(r.finalMap).filter(([f,k])=>data.entries.find(e=>e.id==='RC26-39a5bfdc045342cd').finalMap[f]!==k).map(([f,k])=>`${f}: ${data.entries.find(e=>e.id==='RC26-39a5bfdc045342cd').finalMap[f]}→${k}`).join('；')+'。\n\n';
}
out+=`## 搜索覆盖与限制\n\n历史修复池 ${search.historicalRepairPool} 个合法布局，经全收 A/C 修复点、二键运动前64、移手前16、主行下限前16选取 ${search.historicalSeeds} 个起点。另含起步探索缓存 ${search.otherExploratoryScored} 个布局。完整八轨精评共 ${search.exactlyScored} 个不同布局；其中满足三项旧工效下限的有 ${search.comfortableScored} 个。各中心与新精评数：\n\n`;
for(const p of search.phases)out+=`- ${p.kind==='paired-vowel-budget'?'元音预算定向两步':'第 '+p.round+' 轮一跳'}：中心1倍 ${fmt(p.centerScore)}，2倍 ${fmt(p.centerScore2)}；完整精评 ${p.newScored} 个此前未评分的布局。\n`;
out+=`\n每一跳包含单韵母移动、两韵母交换、整键位合并、整键位交换；所有动作保持完整 R2 声母。硬约束不通过的端点不评分。三轮为有限多中心下降，未穷尽所有韵母排列，也不是两步/三步全空间证明。最终最低点的一跳已封闭：1倍=${search.oneHopStationary.multiplier1}，2倍=${search.oneHopStationary.multiplier2}。\n\n`;
out+=`历史“21×26”容量守卫允许少于26个实际韵母键，因此另列实际使用满26键的结果。1倍最低布局未使用的韵母键为 ${search.best26BudgetUnusedRhymeKeys.best1.join('/')}；2倍最低布局为 ${search.best26BudgetUnusedRhymeKeys.best2.join('/')}，声母仍可使用这些键。固定 R2 声母本身至少造成32个不可避免的主码重码余量，无条件韵母布局最多367个异码；实际布局可能更多重码。\n\n`;
out+=`建议依据两种成本和工效一起选择；单独降低1倍 CKT、却未通过原生产工效门槛的布局，保留为研究候选。当前结果不足以证明固定 R2 声母下不存在同时超过 A/C 且通过工效门槛的方案。进一步工作优先检查较好候选的辅策略与1倍/2倍稳定性，以及在主行与移手门槛内的定向优化。\n\n`;
out+=`## 复算\n\n先准备与 search.json 中哈希一致的 ignored HTML、上游运动表、错误 profile、工效 fixture 及 R11_integrated_replay 三个文件，再运行 \`just r2-onsets-v52-search\` 和 \`just r2-onsets-v52-verify\`。搜索缓存会校验模板、运动表、错误 profile 和 native 可执行文件哈希；输入变化须使用新缓存目录。\n\n`;
out+=`完整映射、八轨重放与20轨独立工效：\`2026-11-20-untoned-r2-onsets-v52-verification.json\`。全量评分证据：\`${search.scoreArchive.path}\`，SHA256=${search.scoreArchive.sha256}。\n`;
fs.writeFileSync(path.join(ROOT,'research/notes/2026-11-20-untoned-r2-onsets-v52-report.md'),out);
console.log(JSON.stringify({reported:verification.verified.length,scored:search.exactlyScored}));
