/* Recent CKT v5.2 research uses minimax relative regret, not the historical mean-rank rule. */
function recentCrPolicyPanel(native){
  const selection=native.publication.policySelection;
  const policy=['word2','word3','word4'].map(k=>native.contract.wordAuxiliaryPolicy[k]).join('/');
  const rows=Object.entries(selection.grids).flatMap(([grid,parts])=>Object.entries(parts).map(([part,v])=>[
    (grid==='main'?'0–5 倍，步长 0.5':'0–10 倍，步长 1')+(part==='positive'?' · 正成本':' · 含零成本'),
    v.points,pct(v.worstRegret),pct(v.meanRegret),pct(v.top1Rate)]));
  return `<section class="card" id="snowJiandaoPolicyStability" data-stable-scheme="${esc(native.id)}"><h3>各自稳健辅序 · CKT v5.2</h3>
    <p>二／三／四字词纯形辅序：<b data-native-word-policy>${esc(policy)}</b>。${esc(native.publication.recentRefinement.route)}。</p>
    <p>枚举 144 种辅序，在六项成本宽网格上最小化相对自身逐点最优辅序的最大损失；以平均损失、默认分数和辅序字典序打破平局。</p>
    <p>同辅序 CKT v5.1：<b data-stable-ckt>${num(native.ckt.v51.score,9)}</b>；默认 CKT v5.2：<b data-native-ckt-v52>${num(native.ckt.v52.score,9)}</b>；六项成本全部加倍：<b data-doubled-v52>${num(selection.doubledV52,9)}</b>（S005 参考同步重算）。</p>
    ${uxTable(['各成本相对默认值','参数点数','最大相对损失','平均相对损失','自身逐点最优占比'],rows,[],'recent-cr-policy-stability')}
    <p class="hint">默认／加倍和全部 benchmark 固定使用上述辅序。网格占比不是现实用户概率。旧移手分仅作为现有表格的历史指标补算，未用于筛选。不同词长的路由、候选池与权重沿用对应 benchmark 合同。</p></section>`;
}
if(typeof snowJiandaoPolicyPanel==='function'){
  const recentCrPreviousPolicyPanel=snowJiandaoPolicyPanel;
  snowJiandaoPolicyPanel=function(native){return native.publication?.policySelection?.version==='recent-cr-v52-minimax-regret-v1'?recentCrPolicyPanel(native):recentCrPreviousPolicyPanel(native)};
}
