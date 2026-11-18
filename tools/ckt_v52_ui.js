function cktV52Resolve(publication,row,id,at,raw){
  if(id&&publication.schemes[id])return publication.schemes[id];
  const text=String(row[at]??'').replace(/<[^>]*>/g,'');
  const old=Number.isFinite(raw?.[at])?raw[at]:parseFloat(text);
  if(!Number.isFinite(old))return null;
  const matches=Object.values(publication.schemes).filter(r=>Math.abs(r.v51.score-old)<1e-7);
  if(!matches.length)return null;
  if(matches.some(r=>Math.abs(r.v52.score-matches[0].v52.score)>1e-10))throw Error('Ambiguous v5.1 row without scheme ID');
  return matches[0];
}
function cktV52TableColumns(headers,rows,ids,key,raws){
  if(!D.cktV52||key.startsWith('ckt-v52-'))return {headers,rows,ids,raws};
  const h=headers.slice(),r=rows.map(x=>x.slice()),v=rows.map((x,i)=>(raws[i]||Array(x.length).fill(null)).slice());
  for(let at=h.length-1;at>=0;at--){
    const label=typeof h[at]==='object'?h[at].label:h[at];
    if(!/CKT(?:-T)?\s*v?5\.1/.test(label))continue;
    const next=typeof h[at+1]==='object'?h[at+1]?.label:h[at+1];
    if(next&&next===label.replace('5.1','5.2'))continue;
    h.splice(at+1,0,{label:label.replace('5.1','5.2'),help:'cktV52'});
    for(let i=0;i<r.length;i++){
      const record=cktV52Resolve(D.cktV52,r[i],ids[i],at,v[i]),score=record?.v52.score;
      r[i].splice(at+1,0,Number.isFinite(score)?`<span data-production-ckt="v52" data-ckt-v52-id="${esc(record.id)}" title="沿用本方案 v5.1 的成员、词长、辅序与候选合同；五六码采用正确率分块乘积。">${num(score,9)}</span>`:'—');
      v[i].splice(at+1,0,Number.isFinite(score)?score:null);
    }
  }
  return {headers:h,rows:r,ids,raws:v};
}
function cktV52Detail(record){
  const modes=Object.keys(record.v51.modes),labels={keytao:'形笔辅',sanpin:'调笔辅',equal:'形／调各半'};
  const kinds={character:'单字',word2:'二字词',word3:'三字词',word4:'四字词'};
  const groups=modes.length===2?[...modes,'equal']:modes;
  const summary=groups.map(mode=>[labels[mode],num(mode==='equal'?record.v51.score:record.v51.memberScores[mode],9),
    num(mode==='equal'?record.v52.score:record.v52.memberScores[mode],9)]);
  const summaryRaw=groups.map(mode=>[labels[mode],mode==='equal'?record.v51.score:record.v51.memberScores[mode],
    mode==='equal'?record.v52.score:record.v52.memberScores[mode]]);
  const rows=[],raw=[];
  for(const mode of groups)for(const kind of Object.keys(kinds)){
    const old=mode==='equal'?record.v51.equalTracks[kind]:record.v51.modes[mode][kind];
    const next=mode==='equal'?record.v52.equalTracks[kind]:record.v52.modes[mode][kind];
    const oldScore=mode==='equal'?old.score:record.v51.trackScores[mode][kind];
    const newScore=mode==='equal'?next.score:record.v52.trackScores[mode][kind];
    const policy=record.kind==='tone-in-main'?record.contract.wordAuxiliaryPolicy:
      mode==='equal'?record.contract.policies.candidate:record.contract.policies.candidate[mode];
    const route=mode==='equal'?null:record.contract.routes[mode][kind];
    const routeText=Array.isArray(route)?route.map(x=>x.stages.map(s=>s.length).join('→')).join(' / '):
      route?'主码 '+route.mainLengths.join('/')+'；终码 '+route.terminalLengths.join('/'):'分别按各成员合同';
    const policyText=kind==='character'?'单字原辅码规则':mode==='equal'?JSON.stringify(policy):policy[kind];
    rows.push([labels[mode],kinds[kind],`<span title="${esc(JSON.stringify(route))}">${esc(routeText)}</span>`,esc(policyText),
      num(old.effectiveMs,6),num(next.effectiveMs,6),num(oldScore,9),num(newScore,9)]);
    raw.push([labels[mode],kinds[kind],routeText,policyText,old.effectiveMs,next.effectiveMs,oldScore,newScore]);
  }
  return `<section class="card" id="cktV52Detail" data-scheme="${esc(record.id)}"><h3>CKT v5.1／v5.2 · 同合同对照</h3>
    <p>${record.kind==='tone-in-main'?'声调已含在主码，后续仅形笔辅；按原生合同计算。':'形笔辅、调笔辅分别计算，综合分中两成员各占一半。'}辅序与候选规则沿用本方案发布的 v5.1，不重新选择辅序。</p>
    ${uxTable(['成员','CKT v5.1','CKT v5.2'],summary,[],'ckt-v52-members',summaryRaw)}
    <details><summary>各成员、各词长的有效耗时与单轨分</summary>
    ${uxTable(['成员','词长','码路','辅序','v5.1 有效 ms','v5.2 有效 ms','CKT v5.1 单轨','CKT v5.2 单轨'],rows,[],'ckt-v52-tracks',raw)}
    <p class="hint">单轨分各自按同成员的 S005 归一；综合分保留单字／二字／三字／四字 1:3:1:1 权重。各半行的耗时为描述性均值，单轨分仍按两个成员的归一四次幂合成。五六码的错误率表来自上游冻结数据重建，仍属模型外推。</p></details></section>`;
}
function cktV52AppendDetail(){
  if(UX.view!=='scheme')return;
  const record=D.cktV52?.schemes[current()?.id],panel=$('#view .panel');
  $('#cktV52Detail')?.remove();
  if(record&&panel)panel.insertAdjacentHTML('beforeend',cktV52Detail(record));
}
if(typeof document!=='undefined'){
  UG.cktV52={title:'CKT v5.2 · 四码前缀与尾段正确率',brief:'逐项沿用对应 v5.1 的合同；只更换五／六码错误损失延拓。',
    detail:'五键按前四键正确率×第4、5键正确率；六码按前四键正确率×第4、5、6键正确率。第四键仅作锚点。二至四码成本、速度模型、辅序、候选池与认知参数保持对应v5.1定义；S005同步复算。形笔辅、调笔辅、各半与各词长的定义在方案详情中分别列出。当前为冻结错误率表重建后的外推模型。',direction:'同合同越低越好'};
  const CKT_V52_RENDER_BASE=uxRender;
  uxRender=function(...args){const value=CKT_V52_RENDER_BASE(...args);cktV52AppendDetail();return value};
  if(typeof snowJiandaoPolicyPanel==='function'){
    const CKT_V52_POLICY_BASE=snowJiandaoPolicyPanel;
    snowJiandaoPolicyPanel=function(native){const old=CKT_V52_POLICY_BASE(native),score=D.cktV52?.schemes[native.id]?.v52.score;
      return old+(Number.isFinite(score)?`<p class="hint">同辅序 CKT v5.2：<b data-native-ckt-v52>${num(score,9)}</b>。上方辅序稳定性网格保留 v5.1 定义。</p>`:'')};
  }
}
if(typeof module!=='undefined')module.exports={cktV52Resolve};
