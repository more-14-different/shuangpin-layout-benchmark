// The ordinary keyboard uses the same full-reading query grammar as toned
// layouts. Keep its selected corpus/band and heat/completion-path contracts.
function unifiedUntonedReading(row, dataset) {
  if (dataset === 'sound') return row.syllables;
  const source = dataset === 'chars' ? D.characters[row.index] : D.words[row.index];
  if (!source) return row.syllables;
  return dataset === 'chars' ? D.pinyin[source[1]] + (source[2] === 5 ? 0 : source[2]) :
    [D.pinyin[source[1]] + (source[3] === 5 ? 0 : source[3]), D.pinyin[source[2]] + (source[4] === 5 ? 0 : source[4])].join(' ');
}

nf5Rows = function(e) {
  const band = ($('#nf5Band')?.value || '1,999999').split(',').map(Number);
  const rawQuery = $('#nf5Query')?.value || '', q = UnifiedKeyboardQuery.normalize(rawQuery), dataset = opt().dataset;
  const parsed = q ? UnifiedKeyboardQuery.parsePinyin(D.pinyin, rawQuery, py => e.codeList?.[py]) : null;
  let z = null, rows;
  if (!D.lite) {
    z = stat(e, {...opt(), band}, true);
    rows = (z.details || []).map(r => {
      const text = String(r.text || ''), row = {text, index: r.index, syllables: nf5Syllables(r, dataset),
        characters: dataset === 'sound' ? nf5SoundCharacters(text) : [], code: String(r.code || ''),
        path: String(r.path || r.code || ''), weight: +r.weight || 0, rank: r.rank, exception: !!e.exceptions?.[r.text]};
      row.reading = unifiedUntonedReading(row, dataset);return row;
    });
  } else rows = nf5FallbackRows(e).map(row => ({...row, reading: row.syllables}));
  if (q) rows = rows.filter(row => {
    if (UnifiedKeyboardQuery.isHanzi(rawQuery)) return row.text === rawQuery.trim() || row.characters.includes(rawQuery.trim());
    if (parsed) return UnifiedKeyboardQuery.matchesReading(parsed, row.reading);
    return [row.code, row.path].some(code => code.toLowerCase().includes(q));
  });
  const queryKeys = !q ? new Set() : parsed ? parsed.keys : UnifiedKeyboardQuery.isHanzi(rawQuery) ?
    UnifiedKeyboardQuery.hanziKeys(rawQuery, D.characters || [], py => e.codeList?.[py],
      rows.filter(row => row.text === rawQuery.trim()), row => UnifiedKeyboardQuery.readingTokens(row.reading)
        .map(token => e.codeList?.[D.pinyin.indexOf(token.syllable)] || '').join('')) : nf5RelevantKeys(rows);
  return {rows, z, band, q, queryKeys};
};

nf5DrawUnified = function(e) {
  const x = nf5Rows(e), filtered = x.rows, active = !!x.q || $('#nf5Band')?.value !== '1,999999';
  const load = nf5Loads(filtered), box = $('#svgbox');
  box.innerHTML = keyboardSVG(e, NF5_STATE.keyboard === 'heat' ? load.loads : null,
    nf4ReadFonts(NF5_STATE.keyboard === 'heat' ? 'load' : 'semantic'));
  if (NF5_STATE.keyboard === 'semantic' && active) {
    const relevant = x.q ? x.queryKeys : nf5RelevantKeys(filtered);
    box.querySelectorAll('g[data-key]').forEach(group => {
      const on = relevant.has(group.dataset.key);
      group.classList.toggle('nf5-dim', !on);group.setAttribute('data-active', String(on));
    });
  }
  const total = filtered.reduce((sum, row) => sum + (+row.weight || 0), 0), note = $('#nf5FilterSummary');
  if (note) note.textContent = `当前筛选 ${filtered.length} 项${total ? ' · 权重值合计 ' + total.toLocaleString('zh-CN') : ''}；${D.lite ? 'Lite 按冻结音节码表联动；' : ''}${NF5_STATE.keyboard === 'semantic' ? '声韵图只高亮查询读音主码；连写全拼按完整音节匹配，未涉及键已淡化' : '键色按匹配语料的实际路径聚合，并以本图最大键负担归一化'}。${x.q && !filtered.length && x.queryKeys.size ? '查询未命中当前语料，声韵图显示读音主码预览；预览不计入热力。' : ''}`;
  const out = $('#nf5DataOut');
  if (out) out.innerHTML = filtered.length ? (NF5_STATE.data === 'matrix' ? nf5Matrix(filtered) : nf5List(filtered)) : '<div class="nf5-empty">当前频段与关键词没有匹配项。</div>';
  const title = $('#nf5DataTitle');if (title) title.textContent = NF5_STATE.data === 'matrix' ? '筛选后的声韵 / 路径矩阵' : '筛选后的合并明细';
};
