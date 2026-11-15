// Add fixed production-policy scores after the ordinary and toned column
// adapters. These values retain their recorded policies when sliders change.
function untonedProductionTableColumns(headers, rows, ids, key, raws) {
  if (!['benchmark', 'fair'].includes(key)) return {headers, rows, ids, raws};
  const entries = new Map(D.entries.map(entry => [entry.id, entry]));
  const natives = D.tonedContractBenchmark?.schemes;
  const toned = natives ? [natives.snowJiandao, ...Object.values(natives.research || {})].filter(Boolean) : [];
  const columns = [
    ['CKT v5 · 生产辅序', 'replayedCktV5', 'v5'],
    ['CKT v5.1 · 生产辅序', 'replayedCktV51', 'v51'],
  ];
  const extendedHeaders = [...headers, ...columns.map(([label]) => ({label, help: 'untonedProductionCKT'}))];
  const extendedRows = rows.map(row => [...row]);
  const extendedRaws = rows.map((row, index) => [...(raws[index] || Array(row.length).fill(null))]);
  rows.forEach((row, index) => {
    const entry = entries.get(ids[index]);
    const native = toned.find(value => value.id === ids[index]);
    for (const [, field, version] of columns) {
      const value = entry?.productionCandidateMetrics?.[field] ?? native?.ckt?.[version]?.score;
      const policies = entry?.productionCandidateMetrics?.[version === 'v51' ? 'cktV51Policies' : 'cktV5Policies'];
      const note = '固定生产辅序；S005=10；不随本表认知延迟滑杆改变。' +
        (policies ? JSON.stringify(policies) : '') + (native ? '带调主码合同。' : '无调主码合同。');
      extendedRows[index].push(Number.isFinite(value)
        ? `<span data-production-ckt="${version}" title="${esc(note)}">${num(value, 6)}</span>` : '—');
      extendedRaws[index].push(Number.isFinite(value) ? value : null);
    }
  });
  return {headers: extendedHeaders, rows: extendedRows, ids, raws: extendedRaws};
}

UG.untonedProductionCKT = {
  title: '生产辅序下的 CKT v5 / v5.1',
  brief: '使用各方案记录的生产辅序与 S005 参考归一；越低越好。',
  detail: '这两列读取已经完整计算的生产合同结果，不随公平表中的认知延迟滑杆改变。无调方案与带调主码方案保留各自合同；不能把 A7E-v5 当作 CKT v5。未补算的方案显示空值。',
  direction: '同合同越低越好',
};
