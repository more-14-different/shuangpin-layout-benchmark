/* TONED_2126_R1_R2_C1_DETAIL_START */
const TONED_2126_R1_R2_C1_KEYBOARD_BASE=snowJiandaoKeyboardSVG;
snowJiandaoKeyboardSVG=function(mode='semantic',load=null,native=snowJiandaoNative()){
 const source=TONED_2126_R1_R2_C1_KEYBOARD_BASE(mode,load,native);
 if(!native?.publication?.policyAudit)return source;
 const svg=new DOMParser().parseFromString(source,'image/svg+xml').documentElement;
 const host=document.createElement('div');host.style.cssText='position:fixed;left:-20000px;top:0;visibility:hidden;width:1700px';
 host.append(svg);document.body.append(host);
 try{
  for(const text of svg.querySelectorAll('[data-rhyme]')){
   const rect=text.closest('g[data-key]').querySelector('clipPath rect');if(!rect)continue;
   const clip=rect.getBBox();let box=text.getBBox();
   const scale=Math.min(1,(clip.width-4)/box.width,(clip.height-4)/box.height);
   if(scale<1){text.setAttribute('font-size',String(parseFloat(getComputedStyle(text).fontSize)*scale));box=text.getBBox()}
   const dx=box.x<clip.x+2?clip.x+2-box.x:box.x+box.width>clip.x+clip.width-2?clip.x+clip.width-2-box.x-box.width:0;
   const dy=box.y<clip.y+2?clip.y+2-box.y:box.y+box.height>clip.y+clip.height-2?clip.y+clip.height-2-box.y-box.height:0;
   if(dx)text.setAttribute('x',String(Number(text.getAttribute('x'))+dx));
   if(dy)text.setAttribute('y',String(Number(text.getAttribute('y'))+dy));
  }
  return new XMLSerializer().serializeToString(svg);
 }finally{host.remove()}
};
const TONED_2126_R1_R2_C1_DETAIL_BASE=snowJiandaoRenderDetail;
snowJiandaoRenderDetail=function(...args){
 const value=TONED_2126_R1_R2_C1_DETAIL_BASE(...args),native=snowJiandaoNative();
 const audit=native?.publication?.policyAudit;
 if(!audit||audit.scope!=='default-and-uniform-doubled-cognitive-cost-only')return value;
 const policy=audit.policy.join('/'),record=D.cktV52?.schemes[native.id];
 const panel=`<section class="card" data-r1-r2-c1-policy="${esc(policy)}"><h3>本方案的固定辅序：${esc(policy)}</h3>
 <p>${esc(native.publication.description)}</p>
 <p>依次为二／三／四字词的形辅字位顺序。各项原生 CKT、终码热力和筛选明细均按此辅序计算；通用 A7E 等列保留各代自身合同。</p>
 <p>CKT 5.2：默认 <b data-refined-default>${num(audit.defaultScore,9)}</b>；认知成本统一加倍 <b data-refined-double>${num(audit.doubleScore,9)}</b>。默认与加倍点均穷举 144 种辅序，当前采用${audit.selectionTarget==='double'?'加倍成本':'默认成本'}目标的固定选择。</p>
 <p class="hint">本轮只核查默认和统一加倍两个成本点，未重新进行六维大范围稳健性排名。左右小指不参与搜索筛选，负担与主行指标照常列出。</p></section>`;
 document.querySelector('#snowJiandaoTonedDetail .two')?.insertAdjacentHTML('afterend',panel);
 if(record&&!document.querySelector('#cktV52Detail'))document.querySelector('#snowJiandaoTonedDetail')?.insertAdjacentHTML('beforeend',cktV52Detail(record));
 return value;
};
/* TONED_2126_R1_R2_C1_DETAIL_END */
