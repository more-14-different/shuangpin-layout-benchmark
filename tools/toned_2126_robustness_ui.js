/* TONED_2126_ROBUST_PUBLICATION_V1 */
const TONED_2126_DETAIL_BASE=snowJiandaoRenderDetail;
snowJiandaoRenderDetail=function(...args){
 const result=TONED_2126_DETAIL_BASE(...args),native=snowJiandaoNative();
 const audit=native?.publication?.robustness;if(!audit)return result;
 const names={positive50To500:'50%–500%',broad0To500:'0–500%',positive100To1000:'100%–1000%'};
 const rows=Object.entries(audit.grids).map(([name,g])=>[names[name]||name,
  g.points.toLocaleString(),pct(g.top1Rate),pct(g.top3Rate),num(g.meanRank,4),g.worstRank,num(g.worstRegret,6)]);
 const panel=`<section class="card toned2126-robustness" data-robust-policy="${esc(audit.selectedPolicy)}"><h3>本页采用的稳健辅序：${esc(audit.selectedPolicy)}</h3>
 <p>依次为二／三／四字词的形辅字位顺序。所有原生 CKT、终码热力与筛选明细均按此辅序重新计算；通用 benchmark 列保留各代自身合同。</p>
 <p>选择依据：六项辅码／选重／扫描／翻页成本独立扰动，在默认值 50%–500% 网格中选平均名次最低的辅序。下列覆盖率是参数网格占比。</p>
 <div class="scroll">${table(['成本范围','组合数','最优覆盖','Top3覆盖','平均名次','最坏名次','距当点最优最大CKT差'],rows)}</div>
 <p class="hint">固定布局与四轨权重；S005 参考成本同点重算。不同范围下可能有不同最优辅序，本页采用上列固定选择，不随滑杆自动换布局或辅序。</p></section>`;
 document.querySelector('#snowJiandaoTonedDetail .two')?.insertAdjacentHTML('afterend',panel);
 return result;
};
/* TONED_2126_ROBUST_PUBLICATION_V1_END */
