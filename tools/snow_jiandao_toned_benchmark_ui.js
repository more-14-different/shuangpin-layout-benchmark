// Column adapters run at the innermost table boundary, after every R2/R9/R10
// wrapper has inserted its columns. Every numeric cell also supplies sort/CSV
// data, rather than appending an unsortable row to rendered HTML.
const SNOW_TONED_ROWS_BASE = Engine7.rowsFor;
Engine7.rowsFor = function(entry, options) {
  return entry?.tonedContract ? tonedRowsFor(D, D.tonedContractBenchmark.schemes.snowJiandao,
    options, Engine7.shapeMap(entry, options.shape || 'snowshape')) : SNOW_TONED_ROWS_BASE(entry, options);
};

function snowJiandaoMetricFilterPass(state) {
  if (!state) return true;
  const native = D.tonedContractBenchmark.schemes.snowJiandao, c = native.columns;
  if (!c) return false;
  const atMost = (name, value) => state[name] === '' || state[name] == null || value <= Number(state[name]) + 1e-12;
  const atLeast = (name, value) => state[name] === '' || state[name] == null || value >= Number(state[name]) - 1e-12;
  // strictNoFly refers to one physical destination per onset/final; a tone
  // conditioned second-key map uses several physical keys for the same final.
  return atMost('d', native.memory.D) && atMost('v', c.rules.V) && atMost('p', c.load.rightPinkyMax20) &&
    atMost('lp', c.load.leftPinkyMax20) && atLeast('h', c.load.homeFloor) && atMost('gap', c.load.rowGap) &&
    atLeast('gapMin', c.load.rowGap) && atMost('far', c.load.farMax) && !state.strict &&
    (!state.weighted || c.tracks.S2.miss <= D.ckt.tracks.S005.S2.miss + 1e-12);
}

let SNOW_CURRENT_STAT_CACHE = null;
function snowJiandaoCurrentStat() {
  const options = UX.applied || lastOptions || opt(), key = JSON.stringify(options);
  if (SNOW_CURRENT_STAT_CACHE?.key === key) return SNOW_CURRENT_STAT_CACHE.value;
  const entry = snowJiandaoTonedFacade();
  const value = ckModel(options) ? CKTEngine.evaluate(entry, options) : Engine7.project(
    Engine7.aggregate(Engine7.rowsFor(entry, options), options), Engine7.costs(options.model, options.scenario, options.confirmCost));
  if (!Number.isFinite(value.eq)) throw new Error('带调当前环境无法计算：' + key);
  SNOW_CURRENT_STAT_CACHE = {key, value};return value;
}

function snowJiandaoScores(tau = bCompletionTau(), first = bCompletionFirstAuxPenalty(), second = bCompletionSecondAuxPenalty()) {
  const native = D.tonedContractBenchmark.schemes.snowJiandao, columns = native.columns;
  const score = (candidate, reference, kinds, penalties = false, cognitive = null) => tonedGeneralizedScore(
    ['keytao', 'sanpin'].flatMap(mode => Object.entries(kinds).map(([kind, weight]) => {
      const r = candidate[mode][kind], b = reference[mode][kind];
      // Ordinary legacy v2/v3 metrics infer physical auxiliary rates from
      // stage weights. Toned metrics record them directly, including zero
      // appended strokes when a tone stage was satisfied inside the main code.
      const adapt = (metric, base) => ({...metric,
        firstAuxRate: metric.firstAuxRate ?? 1 - (metric.stageWeight?.[0] ?? 1),
        secondAuxRate: metric.secondAuxRate ?? Math.max(0, metric.meanKeys - base - (1 - (metric.stageWeight?.[0] ?? 1)))});
      const base = kind === 'character' ? 2 : kind === 'word3' ? 3 : 4;
      return {weight, value: tonedCompletionTime(adapt(r, base), tau, penalties ? first : 0, penalties ? second : 0, cognitive),
        reference: tonedCompletionTime(adapt(b, base), tau, penalties ? first : 0, penalties ? second : 0, cognitive)};
    })));
  const v1 = columns.completion.independent.v1, v2 = columns.completion.independent.v2, v3 = columns.completion.independent.v3;
  const refs = name => D[name].schemes.S005.modes;
  const result = {
    original: score(v1, refs('completionB'), {character: 1, word: 2}),
    fixed: score(v1, refs('completionBFixed'), {character: 1, word: 2}),
    v2: score(v2, refs('completionBV2'), {character: 1, word: 2}, true),
    v3: score(v3, refs('completionBV3'), {character: 1, word2: 3, word3: 1, word4: 1}, true),
    v4: score(columns.completion.modern, refs('completionBV4'), {character: 1, word2: 3, word3: 1, word4: 1}, true, D.completionBV4.cognitiveDefaults),
    v7: score(v1, refs('completionB'), {character: 1, word: 1}),
  };
  result.oldSelections = Object.fromEntries(Object.entries(D.fairCKT.selectionBaselines).map(([frozenTau, baselines]) =>
    [frozenTau, tonedGeneralizedScore(Object.entries(D.fairCKT.weights).map(([track, weight]) => ({weight,
      value: columns.tracks[track].upperMs + Number(frozenTau) * columns.tracks[track].miss,
      reference: baselines[track]})))]));
  result.oldSelectionTau = Object.hasOwn(result.oldSelections,String(tau)) ? tau : 600;
  result.oldSelection = result.oldSelections[String(result.oldSelectionTau)];
  return result;
}

function snowJiandaoColumn(header, tableKey, context) {
  const native = D.tonedContractBenchmark.schemes.snowJiandao, c = native.columns;
  const label = String(typeof header === 'object' ? header.label : header).replace(/[↕↑↓]/g, '').trim();
  const current = () => context.current ||= snowJiandaoCurrentStat();
  const scores = () => context.scores ||= snowJiandaoScores();
  const number = (value, note, unit = 'number') => {
    if (!Number.isFinite(value)) throw new Error(`带调列缺少有效数值：${tableKey} / ${label}`);
    return {value, note, html: `<span data-toned-metric="${esc(label)}" title="${esc(note)}">${unit === 'percent' ? pct(value) : unit === 'integer' ? value.toLocaleString('en-US') : unit === 'pp' ? (value * 100).toFixed(3) + ' pp' : num(value, 6)}</span>`};
  };
  const percentage = (value, note) => number(value, note, 'percent');
  const text = (value, note = '') => ({value, note, html: `<span title="${esc(note)}">${esc(value)}</span>`});
  const formula20 = '同一20合同、语料/形源/词库/顺序及原冻结基线；带调主码已含的调信息不重复追加';
  if (label.startsWith('方案')) return {value: native.id, html: `<button type="button" class="link" data-snow-jiandao-open>${esc(native.id)}</button><small>${esc(native.name)} · 带调主码 · 同列公式适配</small>`};
  if (label.includes('宿主键域') || label === '宿主键域') return text('21×21');
  if (label === '五辅键方向') return text(native.contract.toneKeysByTone, 'toneKeysByTone 边界映射；形辅按 ' + native.contract.shapeKeysByMeaning + '＝折横撇竖点，不追加独立调辅');
  if (label === '固定五辅') return {value: 1, html: '<span title="shapeKeysByMeaning=AVUIO，toneKeysByTone=IVUAO">是</span>'};
  if (label.includes('声韵记忆项 M')) return number(native.memory.lower, `M-T1 规则记忆账；守门 ${native.memory.guard}。同为声韵规则关联数，不替换成无调 M-R2。`, 'integer');
  if (label.includes('原键偏移 D')) return number(native.memory.D, '普通单字母声母只要实际首键离开同名键即计一次', 'integer');
  if (label.includes('韵偏移 V')) return number(c.rules.V, c.rules.definition, 'integer');
  if (/^A7E-v[1-5]$/.test(label)) return number(c.ensemble['v' + label.slice(-1)], formula20 + '；各版本保留自己的轨权重和 β=4 广义均值');
  if (label === 'v6-CW150') return number(c.ensemble.v6, '原 v6 字词平衡权重；(CKT+150×非首选率) 对 S005 同轨归一；带调合同适配');
  if (label === 'v4-C 敏感性') return number(c.ensemble.v4PublicSensitivity, '原 v4 权重/基线；仅用 Chen 公开键对表替换 E34，其余几何项保持原公式');
  if (label === 'FA-1 加权') return number(c.rules.fa.score, 'FA-1-T：原四种模板不变，韵部按声调条件化，再按原频率计算最大一致率');
  if (label === 'LU-v1r') return number(c.rules.lu.score, 'LU-v1r-T：原五种模板、规则支持表与 55/30/15 权重；韵部显式按调条件化');
  if (label === 'S2右小指') return percentage(c.tracks.S2.rightPinky, 'S2 带调音节裸主码击键负担；不是字轨终码负担');
  if (label.includes('右小指20合同最高')) return percentage(c.load.rightPinkyMax20, formula20 + '；先在每轨求 P[]\\;\'/ 合计，再取最大');
  if (label.includes('左小指QAZ 20合同最高')) return percentage(c.load.leftPinkyMax20, formula20 + '；每轨 QAZ 合计后取最大');
  if (label.includes('主行·含形辅下限')) return percentage(c.load.homeFloor, 'min(C4-Snow 主行占比, WX-Snow-12 主行占比)，两项均包含完整形辅');
  if (label === '含辅上下差') return number(c.load.rowGap, 'max(C4上排−下排, WX12上排−下排)，保留原列符号，不使用四轨均值', 'pp');
  if (label.includes("QP;/[']YTBZX,.最大")) return percentage(c.load.farMax, '在同一20合同中对指定各单键取负担最大值');
  const dynamic = typeof header === 'object' && header.dynamic;
  const dynamicLabel = {'当前 CKT ms/项':'eq','当前键对当量 ×10':'eq','每输出字 ms':'perChar','每字成本 ×10':'perChar',
    '非首选权重':'miss','样本数 N':'n','平均键数':'meanKeys','中央 ms/项':'centerMs','外推键保护 ms':'keyGuardMs',
    '长码压力 ms':'lengthGuardMs','含外推键占比':'extrapolatedCodeShare','超四码占比':'longCodeShare','异键同指':'sfb',
    '同键连击':'repeat','左右交替':'alt','右小指负担':'rightPinky','最大单指负担':'maxFinger','主行占比':'home'}[label];
  if (dynamic || dynamicLabel) {
    const name = dynamic || dynamicLabel, raw = current()[name];
    const scale = ['eq','perChar'].includes(name) && !ckModel(UX.applied || lastOptions || opt()) ? 10 : 1;
    return number(raw * scale, '使用本次已应用环境的数据集、合同、形源、词库、字频/等权、范围和模型逐行重算；主码按实际声调取码',
      ['miss','sfb','repeat','alt','rightPinky','maxFinger','home','extrapolatedCodeShare','longCodeShare'].includes(name) ? 'percent' : name === 'n' ? 'integer' : 'number');
  }
  if (label === 'MX34 日常纯汉字') return number(native.macro['daily|hanzi-only'].score, '同一冻结文章与字音，使用实际带调前两码，不含形辅与选重');
  if (label === '原生／统一附辅') return text('原生带调＋纯形辅', '调信息随主码进入；只对尚未编码的信息追加辅码');
  const collision = c.collision, top = collision?.cuts['10000'];
  const collisionMap = {'五档跨族受影响均值':collision?.fiveCutAverageCrossAffectedRate,'五档首选损失均值':collision?.fiveCutAverageCrossFirstChoiceLossRate,
    'Top10k 受影响':top?.crossAffectedRate,'Top10k 首选损失':top?.crossFirstChoiceLossRate,'Top10k 最大桶':top?.maxBucket};
  if (label in collisionMap) return number(collisionMap[label], '同一 Snow 三词典全局词频与五档截点；AUAU/AAAU/AAAA 按实际带调码重放，同码桶按原规则选首选', label.endsWith('最大桶') ? 'integer' : 'percent');
  const bPath = Object.fromEntries(B_PATH_COLUMNS)[label];
  if (bPath) return percentage(c.completion.bPaths[bPath], '原 Common8095 / Snow-common 字词及频权非首选公式；三拼中已内嵌的调步骤不再增键；保留原纯笔画步骤');
  if (label === '裸二键唯一') return {value: c.sound.uniqueCodes, html: `<span title="与无调列同为不同二键码数量／音节总数；带调音节为合法 pinyin+tone，不使用键域容量作分母">${c.sound.uniqueCodes}/${c.sound.syllables}</span>`};
  if (label === '裸 CKT ms') return number(c.tracks.S2.upperMs, '带调 S2 裸音节 CKT；无形辅、无选重，沿用原旧 CKT tensor');
  if (label === 'S2规则补全 CKT ms') return number(c.sound.upperMs, c.sound.formula + '；与原 S2-5SUF 合同一样，不是字轨有效时间');
  const scoreName = {'旧v5-S(四档τ)':'oldSelection','原生综合补全 CKT · 字:词=1:2 · τ ×10':'original',
    '固定 IVUAO 对照 · 字:词=1:2 · τ ×10':'fixed','综合补全 CKT v2 · 固定 IVUAO · 字:词=1:2 · ×10':'v2',
    '综合补全 CKT v3 · 四阶词长 · 原生五键 · ×10':'v3','综合补全 CKT v4 · 联合池 · 上游串击 · ×10':'v4',
    'A7E-v7-B补全 · 字:词=1:1 · τ ×10':'v7'}[label];
  if (scoreName === 'oldSelection') {
    const result = scores(), note = '原列只冻结0/150/300/600ms四档参考；全部四档：' +
      Object.entries(result.oldSelections).map(([tau,value])=>tau+'ms='+num(value,6)).join('；') + '。当前τ不在冻结档时明确显示600ms档，不外推历史参考。';
    const cell = number(result.oldSelection,note);
    cell.html += `<small>τ=${result.oldSelectionTau} ms · 历史冻结档</small>`;return cell;
  }
  if (scoreName) return number(scores()[scoreName], '保留该列的语料、成本版本、竞争池、S005 参考及广义均值权重；随当前 τ/首辅/次辅参数重算，已内嵌的调不增加辅码成本');
  for (const [prefix, mode, kind] of [['键道·单字','keytao','character'],['三拼·单字','sanpin','character'],['键道·二字词','keytao','word'],['三拼·二字词','sanpin','word']]) {
    if (!label.startsWith(prefix + ' ')) continue;
    const metric = c.completion.independent.v1[mode][kind];
    const note = '同列原 Common8095 / Snow-common 数据集及旧 CKT；带调主码满足独立调信息，无重复调辅';
    if (label.endsWith('补全CKT ms')) return number(metric.completionUpperMs, note + '；仅运动时间');
    if (label.endsWith('两B后非首选')) return percentage(metric.p2, note + '；原两个信息步骤后残余非首选率');
    if (label.endsWith('T(τ) ms')) return number(metric.completionUpperMs + bCompletionTau() * metric.p2, note + '；T(τ)=运动时间+τ×残余非首选率');
    if (label.endsWith('补全键数')) return number(metric.meanKeys, note + '；按实际物理击键计，不把已内嵌信息计为额外键');
  }
  for (const [prefix, mode] of [['键道','keytao'],['三拼','sanpin']]) {
    const m = c.completion.independent.v1[mode];
    const mixed = (m.character.completionUpperMs + bCompletionTau() * m.character.p2 + 2 * (m.word.completionUpperMs + bCompletionTau() * m.word.p2)) / 5;
    if (label === prefix + '混合 ms/汉字') return number(mixed, '(单字 T(τ)+2×二字词 T(τ))/5，与原列的字词权重和输出汉字分母一致');
    if (label === prefix + '模型汉字/分钟') return number(60000 / mixed, '60000／同列混合 ms/汉字；模型预测，不是实测输入速度');
  }
  if (label === '音节非首选') return percentage(c.tracks.S2.miss, '合法带调音节裸二键频权非首选率');
  if (label === '单字形码非首选') return percentage(c.tracks['C4-Snow'].miss, '完整 IRXX 字码非首选率；不是逐步补全后选重率');
  if (label === '二字词形码非首选') return percentage(c.tracks['WX-Snow-12'].miss, '完整 IRIRXX 二字词码非首选率；包含该列既定的两形辅');
  throw new Error(`未定义带调列适配：${tableKey} / ${label}`);
}

function snowJiandaoTableRows(headers, rows, ids, key, raws) {
  if (!['benchmark','fair','four-code-collision','r9-macro'].includes(key) || !snowJiandaoBenchmarkVisible() || ids.includes(SNOW_JIANDAO_TONED_ID)) return {headers,rows,ids,raws};
  if (!rows.length && ['benchmark','fair'].includes(key)) {
    // The inherited wrappers skip their supplemental columns for an empty
    // ordinary cohort. Keep those metrics when the toned scheme stands alone.
    const additional = ['原键偏移 D','韵偏移 V','S2右小指','右小指20合同最高','左小指QAZ 20合同最高',
      ...(key === 'benchmark' ? ['主行·含形辅下限','固定五辅','含辅上下差',"QP;/[']YTBZX,.最大",'v6-CW150','v4-C 敏感性'] : [])];
    const existing = new Set(headers.map(header => header.label || header));
    const position = headers.findIndex(header => (header.label || header) === '声韵记忆项 M') + 1;
    headers = [...headers.slice(0,position), ...additional.filter(label => !existing.has(label)), ...headers.slice(position)];
  }
  const context = {}, dataRows = [];
  if (key === 'r9-macro') {
    const native = D.tonedContractBenchmark.schemes.snowJiandao, z = native.macro[r9MacroKey()], n = z.hits;
    const extendedKeyHits = Object.entries(z.heat_map).reduce((sum,[key,value])=>sum+(/^[a-z]$/i.test(key)?0:value),0);
    const raw = [native.id,native.name,z.score,z.chars,n,z.time,z.avg_time,z.total_distance,z.avg_distance,z.effective_distance,z.overlap_distance,z.same_hand_rate,
      ...z.same_finger_hits.slice(0,3).map(v=>v/n),...z.diff_finger_hits.slice(0,3).map(v=>v/n),...z.row_load.map(v=>v/n),z.left_load/n,z.right_load/n,z.finger_load[0]/n,z.finger_load[9]/n,extendedKeyHits,''];
    dataRows.push({raw,row:raw.map((v,at)=>at===0?`<button class="link" data-snow-jiandao-open>${esc(v)}</button>`:at===1?esc(v):at===26?'<button data-snow-macro-heat>查看</button>':at>=11&&at<=24?pct(v):at===3||at===4||at===25?v:num(v,5))});
  } else if (key === 'four-code-collision') {
    const native = D.tonedContractBenchmark.schemes.snowJiandao;
    for (const [cut, metric] of Object.entries(native.columns.collision.cuts)) dataRows.push({
      row: [`<button class="link" data-snow-jiandao-open>${esc(native.id)}</button>`,'21×21','纯 ØY · 带调',Number(cut).toLocaleString(),pct(metric.crossAffectedRate),pct(metric.crossFirstChoiceLossRate),metric.crossBuckets,metric.collisionBuckets,metric.maxBucket],
      raw: [native.id,'21×21','纯 ØY · 带调',Number(cut),metric.crossAffectedRate,metric.crossFirstChoiceLossRate,metric.crossBuckets,metric.collisionBuckets,metric.maxBucket]});
  } else {
    const cells = headers.map(header => snowJiandaoColumn(header, key, context));
    dataRows.push({row: cells.map(cell => cell.html), raw: cells.map(cell => cell.value)});
  }
  return {headers, rows: [...rows,...dataRows.map(item => item.row)], ids: [...ids,...dataRows.map(() => SNOW_JIANDAO_TONED_ID)], raws: [...raws,...dataRows.map(item => item.raw)]};
}

const SNOW_COMPACT_BASE = uxCompactColumns;
uxCompactColumns = function(headers, rows, raws = []) {
  const labels = headers.map(h => h.label || h);
  if (snowJiandaoBenchmarkVisible() && (labels.includes('当前 CKT ms/项') || labels.includes('当前键对当量 ×10') || labels.includes('S2规则补全 CKT ms'))) {
    const context = {}, cells = headers.map(header => snowJiandaoColumn(header, labels.includes('S2规则补全 CKT ms') ? 'fair' : 'benchmark', context));
    const compact = SNOW_COMPACT_BASE(headers, [...rows,cells.map(cell => cell.html)], [...raws,cells.map(cell => cell.value)]);
    compact.rows.pop();compact.raws.pop();return compact;
  }
  return SNOW_COMPACT_BASE(headers, rows, raws);
};

document.addEventListener('click', event => {
  if (!event.target.closest('[data-snow-macro-heat]')) return;
  event.preventDefault();
  const native = D.tonedContractBenchmark.schemes.snowJiandao;
  const key = r9MacroKey(), z = native.macro[key];
  // Reuse the ordinary article replay renderer with the native results; keep
  // the temporary boundary registration scoped to this synchronous render.
  const old = D.macroxue.values[native.id];
  D.macroxue.values[native.id] = {[key]: {...z, extendedKeyHits: Object.entries(z.heat_map).reduce((sum,[letter,hits])=>sum+(/^[a-z]$/i.test(letter)?0:hits),0),
    fullPinyinScoreRatio: z.score / D.macroxue.fullPinyinControl[key].score}};
  let detail = $('#snowJiandaoMacroDetail');
  if (!detail) {detail = document.createElement('section');detail.id = 'snowJiandaoMacroDetail';detail.className = 'card';$('#r9Macro').append(detail)}
  try {detail.innerHTML = r9MacroHeat(native.id)} finally {
    if (old) D.macroxue.values[native.id] = old;else delete D.macroxue.values[native.id];
  }
  R9_MX.scheme = native.id;detail.scrollIntoView({block:'start'});uxFinishSoon();
});
