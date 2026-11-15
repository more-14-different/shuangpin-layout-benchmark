// Add fixed production-policy scores after the ordinary and toned column
// adapters. These values retain their recorded policies when sliders change.
function untonedProductionTableColumns(headers, rows, ids, key, raws) {
  if (!['benchmark', 'fair'].includes(key)) return {headers, rows, ids, raws};
  const entries = new Map(D.entries.map(entry => [entry.id, entry]));
  const natives = D.tonedContractBenchmark?.schemes;
  const toned = natives ? [natives.snowJiandao, ...Object.values(natives.research || {})].filter(Boolean) : [];
  const columns = [
    ['CKT v5 · 历史合同', 'replayedCktV5', 'v5'],
    ['CKT v5.1 · 生产辅序', 'replayedCktV51', 'v51'],
  ];
  const productionAttributes = [
    ['生产首辅率', 'firstAuxRate', 'percent'], ['生产次辅率', 'secondAuxRate', 'percent'],
    ['生产三辅率', 'thirdAuxRate', 'percent'], ['生产选重率', 'selectionRate', 'percent'],
    ['生产平均键数', 'meanKeys', 'number'], ['生产运动 ms', 'motorUpperMs', 'number'],
    ['生产认知 ms', 'cognitiveMs', 'number'], ['生产有效 ms', 'effectiveMs', 'number'],
    ['生产平均扫描候选数', 'meanRejectedCandidates', 'number'], ['生产平均翻页次数', 'meanPageActions', 'number'],
  ];
  if (ids.some(id => entries.get(id)?.productionCandidateMetrics?.productionMetricContract)) {
    columns.push(...productionAttributes);
  }
  const extendedHeaders = [...headers, ...columns.map(([label]) => ({label, help: 'untonedProductionCKT'}))];
  const extendedRows = rows.map(row => [...row]);
  const extendedRaws = rows.map((row, index) => [...(raws[index] || Array(row.length).fill(null))]);
  rows.forEach((row, index) => {
    const entry = entries.get(ids[index]);
    const native = toned.find(value => value.id === ids[index]);
    for (const [, field, version] of columns) {
      const attribute = ['percent', 'number'].includes(version);
      const production = entry?.productionCandidateMetrics;
      const value = attribute ? (production?.productionMetricContract ? production.cktV51Aggregate[field] : null)
        : production?.[field] ?? native?.ckt?.[version]?.score;
      const policies = production?.[version === 'v5' ? 'cktV5Policies' : 'cktV51Policies'];
      const note = (version === 'v5' ? '历史 v5 合同；' : '稳健生产辅序；') + 'CKT以S005=10归一；属性按字词1:3:1:1、双成员等权汇总；不随本表滑杆改变。' +
        (policies ? JSON.stringify(policies) : '') + (native ? '带调主码合同。' : '无调主码合同。');
      const selection = entry?.productionCandidateMetrics?.cktV51AuxOrderSelection;
      const policyKey = p => [p.word2, p.word3, p.word4].join('/');
      const badge = selection && version === 'v51' && policies
        ? `<small class="untoned-policy-label">稳健：形 ${policyKey(policies.candidate.keytao)}；调 ${policyKey(policies.candidate.sanpin)}</small>` : '';
      extendedRows[index].push(Number.isFinite(value)
        ? `<span ${attribute ? 'data-production-attribute' : 'data-production-ckt'}="${attribute ? field : version}" title="${esc(note)}">${version === 'percent' ? pct(value) : num(value, 6)}</span>${badge}` : '—');
      extendedRaws[index].push(Number.isFinite(value) ? value : null);
    }
  });
  return {headers: extendedHeaders, rows: extendedRows, ids, raws: extendedRaws};
}

UG.untonedProductionCKT = {
  title: '稳健生产辅序与生产属性',
  brief: 'CKT v5.1、辅码率、选重、码长、扫描、翻页及耗时使用同一次稳健辅序复算。',
  detail: '标有“稳健”的方案使用形12/213/24、调12/213/21。生产属性来自v5.1原生四词长复算，字/二字/三字/四字权重1:3:1:1，健道与三拼等权。默认首/次/三辅300ms、选重600ms、扫描50ms、翻页300ms，候选页6项。CKT分数以固定S005参考归一。v3/v4/v5与20轨列保留其版本/轨道合同；v5另标历史合同。以上生产列不随历史公平表滑杆改变。未补算的方案显示空值。',
  direction: '同合同越低越好',
};
