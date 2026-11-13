'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const model = require('./ckt_v4_model.js');
const scorer = require('./score_completion_ckt_v4.js');
const legacy3 = require('./score_completion_ckt_v3.js');
const {TONED_BENCHMARK_TRACKS, tonedSoundRows, tonedRowsFor, tonedGeneralizedScore} = require('./toned_benchmark_metrics.js');

function loadEngines(html, data) {
  const context = vm.createContext({atob, console});
  for (const marker of ['Shared-data evaluator.', 'CKT role-aware within-code evaluator.']) {
    const at = html.indexOf(marker), start = html.lastIndexOf('<script', at);
    if (at < 0) throw new Error('Missing atlas engine: ' + marker);
    vm.runInContext(html.slice(html.indexOf('>', start) + 1, html.indexOf('</script>', at)), context);
  }
  context.Engine7.init(data);context.CKTEngine.init(data);
  return context;
}

function normalizeLegacy(rows, snapshot, pair = false, publicPairs = false) {
  const terms = [];
  for (const [track, weight] of Object.entries(snapshot.trackWeights)) {
    if (!pair) terms.push({value: rows[track].upperMs, reference: snapshot.baselines[track], weight});
    else for (const name of ['e34', 'geometry']) terms.push({
      value: rows[track][publicPairs && name === 'e34' ? 'chen' : name],
      reference: snapshot.baselines[track + '|' + name], weight: weight * .5});
  }
  return tonedGeneralizedScore(terms, snapshot.beta || 4);
}

function summarize20(data, native, engines) {
  const {Engine7: engine, CKTEngine: ckt} = engines;
  const original = engine.rowsFor;
  engine.rowsFor = (entry, opt) => entry.tonedContract ? tonedRowsFor(data, native, opt, engine.shapeMap(entry, opt.shape || 'snowshape')) : original(entry, opt);
  const entry = {id: 'SNOW-JIANDAO-TONED-ADAPTED20', tone: native.contract.toneKeysByTone, tonedContract: true};
  const tracks = {}, quick = {};
  const keys = data.reference.keys + '_', chen = (data.r11PairMetrics || data.r9PairMetrics).models.chen;
  const chenCosts = Float64Array.from([...keys].flatMap(a => [...keys].map(b =>
    chen.keys.includes(a) && chen.keys.includes(b) ? chen.matrix[chen.keys.indexOf(a)][chen.keys.indexOf(b)] : NaN)));
  for (const [track, spec] of Object.entries(TONED_BENCHMARK_TRACKS)) {
    const opt = {...spec, cohort: 'common', boundary: 'none', confirm: 0, model: 'ckt'};
    const stat = ckt.evaluate(entry, opt);
    tracks[track] = Object.fromEntries(Object.entries(stat).filter(([, value]) => typeof value === 'number' || typeof value === 'boolean'));
    tracks[track].load = Array.from(stat.load);
    const aggregate = engine.aggregate(engine.rowsFor(entry, opt), {...opt, boundary: 'iid'});
    quick[track] = {e34: engine.project(aggregate, engine.costs('e34')).eq,
      geometry: engine.project(aggregate, engine.costs('geometry')).eq,
      chen: engine.project(aggregate, chenCosts).eq};
  }
  const ensemble = {};
  for (const [key, snapshot] of Object.entries({v1: data.ensemble, v2: data.ensembleV2, v3: data.ensembleV3, v4: data.ensembleV4})) {
    ensemble[key] = normalizeLegacy(quick, snapshot, true);
  }
  ensemble.v5 = normalizeLegacy(tracks, data.ensembleV5);
  ensemble.v4PublicSensitivity = normalizeLegacy(quick, data.ensembleV4, true, true);
  ensemble.v6 = tonedGeneralizedScore(Object.entries(data.ensembleV6.trackWeights).map(([track, weight]) => ({weight,
    value: tracks[track].upperMs + 150 * tracks[track].miss,
    reference: data.ensembleV6.referenceValues[track].guarded + 150 * data.ensembleV6.referenceValues[track].nonfirst})));
  const share = (track, letters) => [...letters].reduce((sum, key) => sum + (tracks[track].load[keys.indexOf(key)] || 0), 0);
  const home = track => share(track, "ASDFGHJKL;'");
  const rows = track => [0, 1, 2].map(row => [...keys].reduce((sum, key, index) => sum + (data.reference.layout[key]?.row === row ? tracks[track].load[index] : 0), 0));
  const rowsC4 = rows('C4-Snow'), rowsWX = rows('WX-Snow-12');
  const load = {homeS2: home('S2'), homeC4: home('C4-Snow'), homeWX: home('WX-Snow-12'),
    homeFloor: Math.min(home('C4-Snow'), home('WX-Snow-12')), rowsC4, rowsWX,
    rowGap: Math.max(rowsC4[0] - rowsC4[2], rowsWX[0] - rowsWX[2]),
    rightPinkyMax20: Math.max(...Object.keys(tracks).map(t => share(t, "P[]\\;'/"))),
    leftPinkyMax20: Math.max(...Object.keys(tracks).map(t => share(t, 'QAZ'))),
    maxFinger20: Math.max(...Object.values(tracks).map(t => t.maxFinger)),
    indexFingerTYBMax20: Math.max(...Object.keys(tracks).map(t => share(t, 'TYB'))),
    farMax: Math.max(...Object.keys(tracks).flatMap(t => [..."QP;/[']YTBZX,."].map(k => share(t, k))))};
  return {tracks, quick, ensemble, load};
}

function expandToneInventory(data, native) {
  const index = new Map(), pinyin = [], codeList = [];
  for (let py = 0; py < data.pinyin.length; py++) for (let tone = 1; tone <= 5; tone++) {
    const code = native.tonedCodes[py][tone - 1];
    if (code) {index.set(py + ':' + tone, pinyin.length);pinyin.push(data.pinyin[py] + tone);codeList.push(code)}
  }
  const sound = tonedSoundRows(data, native);
  const expanded = {...data, pinyin, base: sound.map(row => [index.get(row.py + ':' + row.tone), row.w]),
    characters: data.characters.map(row => [row[0], index.get(row[1] + ':' + row[2]) ?? -1, ...row.slice(2)]),
    words: data.words.map(row => [row[0], index.get(row[1] + ':' + row[3]) ?? -1, index.get(row[2] + ':' + row[4]) ?? -1, ...row.slice(3)])};
  return {data: expanded, entry: {id: native.id, tone: native.contract.toneKeysByTone, capacity: [21, 21], codeList}, index};
}

function stripEmbeddedTone(stages, kind) {
  if (kind === 'character') return stages.map((codes, at) => at === 0 ? codes : codes.map(code => code.slice(0, 2) + code.slice(3)));
  if (kind === 'word' || kind === 'word2') return stages.map(codes => codes.map(code => code.slice(0, 4)));
  // Initial-only three/four-character abbreviations have discarded the
  // syllables' second keys, and consequently have not retained their tones.
  return stages;
}

function independentCompletion(rows, cost, baseLength, lex) {
  const entries = rows.filter(row => row.codes.every(choices => choices.length));
  const winners = [0, 1, 2].map(stage => {
    const buckets = new Map();
    for (const row of entries) for (const code of row.codes[stage]) {
      const old = buckets.get(code);
      if (!old || row.weight > old.weight || row.weight === old.weight && lex(row.text, old.text) < 0) buckets.set(code, row);
    }
    return buckets;
  });
  const metric = {count: entries.length, totalWeight: 0, completionUpperMs: 0, meanKeys: 0,
    p0: 0, p1: 0, p2: 0, firstAuxRate: 0, secondAuxRate: 0, stageWeight: [0, 0, 0]};
  for (const row of entries) {
    const first = [0, 1, 2].map(stage => row.codes[stage].some(code => winners[stage].get(code) === row));
    const stage = first[0] ? 0 : first[1] ? 1 : 2;
    const choices = row.codes[stage].filter(code => stage < 2 || !first[2] || winners[stage].get(code) === row);
    const selected = choices.map(code => ({code, ms: cost(code).upperMs})).sort((a, b) => a.ms - b.ms || lex(a.code, b.code))[0];
    const w = row.weight, extra = selected.code.length - baseLength;
    metric.totalWeight += w;metric.completionUpperMs += w * selected.ms;metric.meanKeys += w * selected.code.length;
    for (let at = 0; at < 3; at++) if (!first[at]) metric['p' + at] += w;
    metric.firstAuxRate += w * (extra >= 1);metric.secondAuxRate += w * (extra >= 2);metric.stageWeight[stage] += w;
  }
  if (!(metric.totalWeight > 0)) throw new Error('Empty completion cohort');
  for (const name of ['completionUpperMs', 'meanKeys', 'p0', 'p1', 'p2', 'firstAuxRate', 'secondAuxRate']) metric[name] /= metric.totalWeight;
  metric.stageWeight = metric.stageWeight.map(w => w / metric.totalWeight);
  return metric;
}

function v2Motor(data) {
  const source = data.cktV2, keys = source.keys;
  const tables = Object.fromEntries(Object.entries(source.tables).map(([name, value]) => {
    const bytes = Buffer.from(value, 'base64');return [name, new Float64Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))];
  }));
  return code => {
    const indices = [...code].map(key => keys.indexOf(key));
    if (indices.some(at => at < 0)) throw new Error('Unsupported native-v2 key');
    const role = (name, items) => tables[name][items.reduce((at, item) => at * keys.length + item, 0)];
    let value;
    if (indices.length === 2) value = role('L2i1', indices);
    else if (indices.length === 3) value = role('L3i1', indices) + role('L3i2', indices);
    else {
      value = role('L4i1', indices.slice(0, 3)) + role('L4i3', indices.slice(-3));
      for (let at = 0; at <= indices.length - 4; at++) value += role('L4i2', indices.slice(at, at + 4));
      value = Math.max(0, value) + (indices.length - 4) * source.longGuardMs;
    }
    return {upperMs: value};
  };
}

function completeColumns({data, native, snow, engines, words, motor}) {
  const expanded = expandToneInventory(data, native);
  const strokes = scorer.strokeOptions(path.join(snow, 'rime-stroke/stroke.dict.yaml'));
  const stroke = {alternatives: strokes, primary: new Map([...strokes].map(([char, choices]) => [char, [...choices][0]]))};
  const {makeRows} = require(path.join(snow, 'scripts/research/score_shenyun_completion_ckt.js'));
  const initial = makeRows(expanded.data, expanded.entry, stroke, 'native');
  const independent = {v1: {keytao: {}, sanpin: {}}, v2: {keytao: {}, sanpin: {}}, v3: {keytao: {}, sanpin: {}}};
  const motor2 = v2Motor(data), costCaches = {v1: new Map(), v2: new Map()};
  const costs = {v1: code => engines.CKTEngine.codeCost(code), v2: motor2};
  const cachedCost = version => code => {
    if (!costCaches[version].has(code)) costCaches[version].set(code, costs[version](code));
    return costCaches[version].get(code);
  };
  for (const mode of ['keytao', 'sanpin']) for (const [kind, source] of [['character', initial.chars], ['word', initial.words]]) {
    const rows = source.filter(row => row.common).map(row => ({text: row.text, weight: row.weight,
      codes: mode === 'sanpin' ? stripEmbeddedTone(row[mode], kind) : row[mode]}));
    for (const version of ['v1', 'v2']) independent[version][mode][kind] = independentCompletion(rows, cachedCost(version), kind === 'character' ? 2 : 4, engines.Engine7.lex);
  }
  const multi = legacy3.extractMultiwords(path.join(snow, 'snow_pinyin.base.dict.yaml'), new Map(data.pinyin.map((py, index) => [py, index])), data.shapes.snowshape);
  const convert = item => ({...item, py: item.py.map((py, at) => expanded.index.get(py + ':' + item.tones[at]) ?? -1)});
  const multiExpanded = {w3: multi.w3.map(convert), w4: multi.w4.map(convert)};
  const fourRows = legacy3.makeRowsForScheme(expanded.entry, expanded.data, stroke, multiExpanded);
  for (const mode of ['keytao', 'sanpin']) for (const kind of ['character', 'word2', 'word3', 'word4']) {
    const rows = fourRows[mode][kind].map(row => ({...row, codes: mode === 'sanpin' ? stripEmbeddedTone(row.codes, kind) : row.codes}));
    independent.v3[mode][kind] = independentCompletion(rows, cachedCost('v2'), kind === 'character' ? 2 : kind === 'word3' ? 3 : 4, engines.Engine7.lex);
  }
  const modern = {keytao: {}, sanpin: {}};
  const expandedWords = Object.fromEntries(Object.entries(words).map(([kind, rows]) => [kind, rows.map(convert)]));
  for (const mode of ['keytao', 'sanpin']) {
    let rows = scorer.buildRows(expanded.entry, expanded.data, strokes, expandedWords, mode);
    if (mode === 'sanpin') rows = rows.map(row => {
      if (!['character', 'word2'].includes(row.kind)) return row;
      const stages = stripEmbeddedTone(row.stages.map(stage => stage.codes), row.kind);
      const unique = stages.filter((codes, at) => !at || codes.join('|') !== stages[at - 1].join('|'));
      return {...row, stages: unique.map(codes => ({codes, length: codes[0].length, order: codes[0].length,
        pool: row.kind === 'word2' ? 'word:four' : codes[0].length === 2 ? 'char:base' : 'char:aux1'}))};
    });
    const outcomes = model.resolveCompetition(rows, {motorCost: motor});
    modern[mode] = model.summarizeOutcomes(outcomes, data.completionBV4.cognitiveDefaults);
  }
  const bPaths = {j1: independent.v1.keytao.character.p1, j2: independent.v1.keytao.character.p2,
    s1: independent.v1.sanpin.character.p1, s2: independent.v1.sanpin.character.p2,
    wj1: independent.v1.keytao.word.p1, wj2: independent.v1.keytao.word.p2,
    ws1: independent.v1.sanpin.word.p1, ws2: independent.v1.sanpin.word.p2};
  return {independent, modern, bPaths};
}

function soundCompletion(data, native, cost, lex) {
  const rows = tonedSoundRows(data, native), buckets = new Map();
  for (const row of rows) {const bucket = buckets.get(row.code) || [];bucket.push(row);buckets.set(row.code, bucket)}
  let upperMs = 0, meanKeys = 0, total = 0, extendedWeight = 0;
  // This is a base-5 enumeration alphabet, not a second tonal instruction.
  // Preserve the ordinary S2-5SUF physical ordering for like-for-like scoring.
  const suffixAlphabet = native.contract.toneKeysByTone;
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => b.w - a.w || lex(a.text, b.text));
    const length = bucket.length > 1 ? Math.ceil(Math.log(bucket.length) / Math.log(5)) : 0;
    for (let index = 0; index < bucket.length; index++) {
      const row = bucket[index];let number = index, suffix = '';
      for (let at = 0; at < length; at++) {suffix = suffixAlphabet[number % 5] + suffix;number = Math.floor(number / 5)}
      const code = row.code + suffix;
      upperMs += row.w * cost(code).upperMs;meanKeys += row.w * code.length;total += row.w;
      if (length) extendedWeight += row.w;
    }
  }
  return {upperMs: upperMs / total, meanKeys: meanKeys / total, extendedWeight: extendedWeight / total,
    uniqueCodes: buckets.size, syllables: rows.length, suffixAlphabet,
    formula: 'collision buckets: fixed-width base5 suffix for every member; own ordered five-key enumeration alphabet (not tone evidence)'};
}

function buildTonedColumns({html, data, native, snow, words, motor}) {
  const engines = loadEngines(html, data);
  const twenty = summarize20(data, native, engines);
  const completion = completeColumns({data, native, snow, engines, words, motor});
  const sound = soundCompletion(data, native, engines.CKTEngine.codeCost, engines.Engine7.lex);
  const rules = require('./toned_rule_metrics.js').toneRuleMetrics(data, tonedSoundRows(data, native));
  return {version: 'tone-in-main-column-contracts-v2', ...twenty, completion, sound, rules,
    policy: {tracks: 'same 20 contracts; embedded tone evidence counted once',
      soundWeights: 'common399 pinyin mass times common-character conditional tone frequency; equal legal-tone fallback only when no observed tone mass',
      soundCompletion: sound.formula, completionV1V2: 'same Common8095 and Snow-common two-word cohorts as legacy columns',
      completionV3: 'same fixed 15000 three/four-word cohorts; independent pools; native-v2 tensor',
      completionV4: 'same frozen 99% dictionary cohorts, routing/pools, motor tensor, rank/page cognitive formula',
      sanpin: 'full syllables already encode tone; remove redundant tone strokes. Initial-only word3/word4 retain separate tone evidence.'}};
}

module.exports = {loadEngines, summarize20, normalizeLegacy, expandToneInventory, stripEmbeddedTone,
  independentCompletion, v2Motor, soundCompletion, buildTonedColumns};

if (require.main === module) {
  const option = (name, fallback) => {const at = process.argv.indexOf('--' + name);return at < 0 ? fallback : process.argv[at + 1]};
  const html = fs.readFileSync(option('html', 'a7_CKT_R11.html'), 'utf8');
  const data = scorer.loadPayload(option('html', 'a7_CKT_R11.html'));
  const snow = option('snow', 'D:/C2D/Documents/rime-snow-pinyin');
  const nativePath = option('native', null);
  const native = nativePath ? JSON.parse(fs.readFileSync(nativePath, 'utf8')) : data.tonedContractBenchmark.schemes.snowJiandao;
  const words = scorer.multiwords(path.join(snow, 'snow_pinyin.base.dict.yaml'), data, .99);
  const motor = require('./score_toned_2121_ckt_v51.js').projectedMotor(data);
  const result = buildTonedColumns({html, data, native, snow, words, motor});
  const output = option('output', 'a7_CKT_R11_integrated_materials/snow_jiandao_toned_columns.json');
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({output, ensemble: result.ensemble, sound: result.sound, load: result.load}));
}
