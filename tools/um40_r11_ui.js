/* Original UM40 trio: default and synchronously doubled cognitive costs. */
if(typeof cktV52Detail==='function'){
  const um40PreviousDetail=cktV52Detail;
  cktV52Detail=function(record){
    document.querySelector('#um40OriginalTrio')?.remove();
    const panel=um40PreviousDetail(record);
    const entry=D.entries.find(e=>e.id===record.id);
    if(!entry?.um40Publication)return panel;
    const cohort=D.entries.filter(e=>e.um40Publication);
    const rows=cohort.map(e=>[uxId(e.id),e.um40Publication.label,40,3,
      num(D.cktV52.schemes[e.id].v52.score,9),num(e.um40Publication.doubledV52,9),'空','zen']);
    return panel+`<section class="card" id="um40OriginalTrio" data-scheme="${esc(record.id)}">
      <h3>UM40 原方案三选</h3>
      <p>三者声母布局相同，仅韵母有差异；Common399 均为 399/399 唯一码。QZ 空桶，ZQ 含 zen。</p>
      <p>1x：默认六项认知成本；2x：六项成本同步加倍，S005 参考同步重算。</p>
      ${uxTable(['方案','定位','M','D','CKT v5.2 · 1x ↓','CKT v5.2 · 2x ↓','QZ','ZQ'],rows,cohort.map(e=>e.id),'um40-original-trio')}
      <p>偏向 1x 相对当前：ai T→G、uai D→S、un/vn G→T；偏向 2x 相对当前：uai D→Z。</p>
    </section>`;
  };
}
