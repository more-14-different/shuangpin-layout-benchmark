'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {audit,rebuild}=require('./untoned_r2_search_metrics'),{changes}=require('./search_untoned_r2_restored399_v52');
const ROOT=path.resolve(__dirname,'..'),PREFIX='2026-11-20-untoned-r2-restored399-v52',read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const search=read(`research/notes/${PREFIX}-search.json`),verification=read(`research/notes/${PREFIX}-verification.json`),bounds=read('research/notes/2026-11-20-untoned-r2-399-onset-lower-bounds.json'),certificate=read('research/notes/2026-11-20-untoned-399-minimum26-certificate.json'),input=read('research/config/untoned-r2-restore399-v52-input.json');
assert.ok(search.completed&&verification.complete&&verification.searchCompleted);assert.equal(search.exactlyScored,verification.exactlyScored);
assert.equal(certificate.minimumFinalKeys,26);assert.equal(bounds.metrics['26-families'].lowerBound,4);assert.equal(bounds.metrics['26-entries'].lowerBound,6);
const bytes=fs.readFileSync(path.join(ROOT,search.scoreArchive.path));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),search.scoreArchive.sha256);
const rows=zlib.gunzipSync(bytes).toString('utf8').trim().split('\n').map(JSON.parse);assert.equal(rows.length,search.exactlyScored);assert.equal(new Set(rows.map(r=>r.key)).size,rows.length);
const {HEADS,FINALS}=require('./ckt_v4_scheme_fixture');
const data={pinyin:input.common.map(r=>r.py),base:input.common.map((r,i)=>[i,r.weight])};
for(const r of rows){const e=rebuild({capacity:[21,26],tone:'IEUAO',initialMap:Object.fromEntries(HEADS.map((h,i)=>[h,String.fromCharCode(65+r.state[i])])),finalMap:Object.fromEntries(FINALS.map((f,i)=>[f,String.fromCharCode(65+r.state[27+i])])),codeList:Array(399).fill('AA')},data);assert.deepEqual(audit(e,data),r.audit);assert.equal(r.audit.unique,399);assert.deepEqual(changes(r.state,input.sourceInitialMap),{entries:6,families:4});}
const result={version:1,conclusion:'399 unique codes are constructively feasible with the minimum 4 changed onset-rule families / 6 mappings, using all 26 final keys. Empty Q, empty Z or both are impossible under <=21 initial keys and zero branches, independent of the M/D budget and CKT formula.',contract:search.contract,sourceId:search.sourceId,minimumFinalKeys:certificate.minimumFinalKeys,capacityCertificate:search.certificate,clique26:certificate.clique26,minimumOnsetRules:4,minimumOnsetEntries:6,constructedSeeds:search.constructedSeeds,exactlyScored:search.exactlyScored,allRowsAudited399Unique:true,CKTSearchScope:search.scope||'Two rounds of rhyme-only local scans after 56 constructive seeds; fixed A/C auxiliary policies and physical mapping; not a global CKT optimum or complete neighborhood closure of final winners.',baselines:search.baselines,verified:verification.verified.map(r=>({id:r.id,score:r.score,score2:r.score2,audit:r.audit,erg:r.erg,independent:r.independent,productionAdmissible:r.productionAdmissible,initialMap:r.initialMap,finalMap:r.finalMap,changesFromR2:Object.fromEntries(HEADS.filter(h=>r.initialMap[h]!==input.sourceInitialMap[h]).map(h=>[h,[input.sourceInitialMap[h],r.initialMap[h]]]))})),infeasibleCases:search.infeasibleCategories,scoreArchive:search.scoreArchive,oneHopStationary:search.oneHopStationary};
const sourceFiles=['research/config/untoned-r2-restore399-v52-input.json','research/notes/2026-11-20-untoned-r2-399-onset-lower-bounds.json',search.certificate,'tools/restore_untoned_r2_399_v52.py','tools/search_untoned_r2_restored399_v52.js','tools/report_untoned_r2_restored399_v52.js'];
result.sourceHashes=Object.fromEntries(sourceFiles.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,f))).digest('hex')]));
if(search.diverseSeedSource){result.diverseSeedSource=search.diverseSeedSource;result.sourceHashes[search.diverseSeedSource]=crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,search.diverseSeedSource))).digest('hex');}
if(search.twoHopScreens){result.twoHopScreens=search.twoHopScreens;const p='tools/search_untoned_r2_restored399_twohop_v52.js';result.sourceHashes[p]=crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,p))).digest('hex');}
fs.writeFileSync(path.join(ROOT,`research/notes/${PREFIX}-result.json`),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({audited:rows.length,verified:result.verified.map(r=>({id:r.id,score:r.score,score2:r.score2})),minimumFinalKeys:26}));
const fmt=(n,d=9)=>n.toFixed(d),pct=n=>fmt(100*n,3)+'%';
const previous={score:9.14616395225315,score2:9.096819872938095,scored:581};
let text='# 恢复399异码后的继续搜索\n\n';
text+='保留M-R2≤40、D≤3、V≤1、无分支、Common399恰好399个主码、主码QZ/ZQ双空。相对原R2保持最少4组声母规则／6个映射项改动；本轮不放宽到更多声母改动。\n\n';
text+='评分为完整CKT v5.2八轨，形辅/调辅各半，单/二/三/四字权重1:3:1:1；沿用形辅12/12/24、调辅12/21/13、toneKeysByTone=IEUAO、shapeKeysByMeaning=AEUIO、42310配对。2倍将候选与S005六项认知延时一起翻倍。没有重新枚举辅序。\n\n';
text+='|方案|1倍CKT↓|2倍CKT↓|移手↑|S2主行↑|20轨主行下限↑|\n|---|---:|---:|---:|---:|---:|\n';
for(const [i,b] of result.baselines.entries())text+=`|${i?'C':'A'}|${fmt(b.v52[1])}|${fmt(b.v52[2])}|—|—|—|\n`;
text+=`|上轮399异码最低|${fmt(previous.score)}|${fmt(previous.score2)}|—|—|—|\n`;
for(const r of result.verified)text+=`|${r.id}|${fmt(r.score)}|${fmt(r.score2)}|${fmt(r.erg.mx,6)}|${pct(r.erg.homeS2)}|${pct(r.erg.homeFloor)}|\n`;
text+='\n';
for(const r of result.verified){text+=`## ${r.id}\n\n相对上轮净差：1倍 ${fmt(r.score-previous.score)}，2倍 ${fmt(r.score2-previous.score2)}；负值更低。M/D/V=${r.audit.M}/${r.audit.D}/${r.audit.V}，Common399异码数${r.audit.unique}。\n\n声母相对R2改动：${Object.entries(r.changesFromR2).map(([h,[a,b]])=>h+': '+a+'→'+b).join('；')}。\n\n`;
text+=`独立A7-E v4=${fmt(r.independent.a7eV4)}，S2 e34=${fmt(r.independent.tracks.S2.e34)}，全部原生产工效门槛：${r.productionAdmissible?'通过':'未通过'}。\n\n`;
text+='韵母映射：'+Object.entries(r.finalMap).map(([f,k])=>f+'→'+k).join('，')+'。\n\n';}
text+=`累计完整精评${rows.length}个不同布局，比上轮新增${rows.length-previous.scored}个；构造起点${search.constructedSeeds}个；完成${search.phases.length}个中心的合法一跳扫描。`;
if(search.diverseSeedSource)text+='额外224个远点来自28套声母布局上的可复现MILP扰动，按字符运动、接近A/C、S2主行及主行下限代理构造；代理只用于产生候选，最终全部使用完整CKT评分。';
text+=`\n\n最终1倍/2倍最低点的一跳已完整扫描：${search.oneHopStationary.multiplier1} / ${search.oneHopStationary.multiplier2}。该结论只涵盖单韵母移动、两韵母交换、整键合并和整键交换。没有穷尽两步联动、全局韵母排列或更多声母改动。\n\n`;
if(search.twoHopScreens){text+='两步联动：先枚举所有操作对的合法端点（包含非法中间布局），再以两种成本的单步可加预测、二键运动代理、确定性探索筛选端点做完整CKT。枚举合法端点不等于完整CKT搜透两步空间。\n\n';for(const s of search.twoHopScreens)text+=`- 中心 ${s.center}：${s.orderedPairsVisited} 个有序操作对，${s.newLegalEndpoints} 个未评分的合法端点，其中 ${s.viaIllegalIntermediate} 个经由非法中间布局；完整CKT精评 ${s.selectedFullScores} 个。\n`;text+='\n';}
text+='399异码需要至少26韵母键位的结构证明仍成立，因此空Q韵、空Z韵和Q/Z韵母双空没有合规候选；主码QZ/ZQ两桶为空可以保留。\n\n';
text+='完整布局和独立20轨工效在同名前缀 result.json；完整八轨JS重放在 verification.json；全量native评分在 scores.jsonl.gz，SHA256='+search.scoreArchive.sha256+'。\n\n复核现有结果运行 `just r2-restore399-v52-verify`。继续探索运行 `just r2-restore399-v52-diverse` 或 `just r2-restore399-v52-twohop`；后两者会新增探索与更新候选，不能视为只读复核。输入哈希变化会拒绝复用旧评分。\n';
fs.writeFileSync(path.join(ROOT,`research/notes/${PREFIX}-continuation.md`),text);
