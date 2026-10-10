#!/usr/bin/env node
/* Universal Completion CKT v3 Calculator for All Schemes.
 * Supports arbitrary capacities (21x21, 21x26, 21x28, 23x23, 26x26, 25x30, etc.)
 * and arbitrary native 5-key auxiliary mappings (IVUAO, OEWAY, IEUAO, UOEIA, AEUIO, etc.).
 * 4-track closed-loop evaluation: character (1), word2 (2), word3 (3), word4 (4).
 * Omits words of length >= 5 (equivalent initial-only output across schemes, no collisions).
 * 2-char words and 4-char words compete directly in 4-key code space.
 * Weights: [1, 3, 1, 1] matching 5000-char optimal segmentation tests.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (['--html', '--output', '--embed', '--limit'].includes(argv[i])) {
      args[argv[i].slice(2)] = argv[i + 1];
    }
  }
  if (!args.html) {
    args.html = path.resolve(__dirname, '../a7_CKT_R11.html');
  }
  return args;
}

function loadPage(file) {
  const html = fs.readFileSync(file, 'utf8');
  const tag = '<script id="payload"';
  const at = html.indexOf(tag);
  if (at < 0) throw Error('R11 payload not found');
  const start = html.indexOf('>', at) + 1;
  const end = html.indexOf('</script>', start);
  const data = JSON.parse(zlib.gunzipSync(Buffer.from(html.slice(start, end), 'base64')));
  for (const marker of ['Shared-data evaluator.', 'CKT role-aware within-code evaluator.']) {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    const source = scripts.find(match => match[1].includes(marker));
    if (!source) throw Error('R11 engine not found: ' + marker);
    vm.runInThisContext(source[1], {filename: marker});
  }
  if (!data.ckt?.tables || data.lite) throw Error('full R11 CKT tensor required');
  Engine7.init(data);
  CKTEngine.init(data);

  // Setup upstream CKT v2 model
  const model = data.cktV2;
  const roles = ['L2i1', 'L3i1', 'L3i2', 'L4i1', 'L4i2', 'L4i3'];
  const tables = Object.fromEntries(roles.map(role => {
    const buf = Buffer.from(model.tables[role], 'base64');
    return [role, new Float64Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))];
  }));
  const index = Object.fromEntries([...model.keys].map((key, i) => [key, i]));
  const donors = data.ckt.calibration.extension_maps;
  const oldCost = CKTEngine.codeCost;

  function nativeCost(code) {
    const a = [...code].map(key => index[key]);
    if (a.some(value => value === undefined) || a.length < 2) return null;
    function role(name, part) {
      let cur = 0;
      for (const key of part) cur = cur * 30 + key;
      return tables[name][cur];
    }
    if (a.length === 2) return role('L2i1', a);
    if (a.length === 3) return role('L3i1', a) + role('L3i2', a);
    let total = role('L4i1', a.slice(0, 3)) + role('L4i3', a.slice(-3));
    for (let j = 0; j <= a.length - 4; j++) total += role('L4i2', a.slice(j, j + 4));
    return Math.max(total, 0) + (a.length - 4) * model.longGuardMs;
  }

  CKTEngine.codeCost = code => {
    const old = oldCost(code);
    if (!old) return null;
    const projected = [...code].map(key => donors[key]
      ? Object.entries(donors[key].donors).sort((a, b) => b[1] - a[1])[0][0] : key).join('');
    const native = nativeCost(projected);
    const oldProjected = oldCost(projected);
    if (native === null || !oldProjected) return null;
    const upperMs = Math.max(0, old.upperMs + native - oldProjected.upperMs);
    return {...old, centerMs: upperMs, upperMs};
  };

  return { html, data, tag, start, end };
}

function strokeOptions(file) {
  const alternatives = new Map();
  const primary = new Map();
  let started = false;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!started) { started = line.trim() === '...'; continue; }
    const fields = line.split('\t');
    if (fields.length < 2 || !fields[1] || !/[hspnz]/.test(fields[1][0]) || /[^hspnz]/.test(fields[1])) continue;
    const [character, spelling] = fields;
    const key = spelling[0];
    if (!primary.has(character)) primary.set(character, key);
    if (!alternatives.has(character)) alternatives.set(character, new Set());
    alternatives.get(character).add(key);
  }
  return {primary, alternatives};
}

const SHAPE_FROM = 'IEUAO';
const STROKE_SLOT = {s:0, h:1, p:2, z:3, n:4};
function physicalShape(abstract, toneKeys) {
  return [...(abstract || '')].map(key => toneKeys[SHAPE_FROM.indexOf(key)] || '').join('');
}
function physicalStroke(strk, toneKeys) {
  return strk && toneKeys[STROKE_SLOT[strk]] || null;
}
function winnerBeats(a, b) {
  return !b || a.weight > b.weight || (a.weight === b.weight && Engine7.lex(a.text, b.text) < 0);
}
function winners(rows, stage) {
  const buckets = new Map();
  for (const row of rows) for (const code of row.codes[stage]) {
    if (winnerBeats(row, buckets.get(code))) buckets.set(code, row);
  }
  return buckets;
}
function first(row, bucket, stage) {
  return row.codes[stage].some(code => bucket.get(code) === row);
}

function scoreCohort(entries, costCache) {
  const buckets = [0, 1, 2].map(stage => winners(entries, stage));
  let total = 0, coverage = 0, weightedCenter = 0, weightedUpper = 0, weightedKeys = 0;
  let p0 = 0, p1 = 0, p2 = 0;
  const selected = [0, 0, 0];
  for (const row of entries) {
    total += row.weight;
    if (row.codes.some(options => options.length === 0)) continue;
    const first0 = first(row, buckets[0], 0);
    const first1 = first(row, buckets[1], 1);
    const first2 = first(row, buckets[2], 2);
    const stage = first0 ? 0 : first1 ? 1 : 2;
    const choices = row.codes[stage].filter(code => stage !== 2 || !first2 || buckets[2].get(code) === row);
    let best = null, chosen = null;
    for (const code of choices) {
      if (!costCache.has(code)) costCache.set(code, CKTEngine.codeCost(code));
      const cost = costCache.get(code);
      if (cost && (!best || cost.upperMs < best.upperMs || cost.upperMs === best.upperMs && code < chosen)) {
        best = cost; chosen = code;
      }
    }
    if (!best) continue;
    coverage += row.weight;
    if (!first0) p0 += row.weight;
    if (!first1) p1 += row.weight;
    if (!first2) p2 += row.weight;
    selected[stage] += row.weight;
    weightedCenter += row.weight * best.centerMs;
    weightedUpper += row.weight * best.upperMs;
    weightedKeys += row.weight * chosen.length;
  }
  if (!coverage) return null;
  return {
    count: entries.length,
    totalWeight: total,
    coveredWeight: coverage,
    completionUpperMs: weightedUpper / coverage,
    meanKeys: weightedKeys / coverage,
    p0: p0 / coverage,
    p1: p1 / coverage,
    p2: p2 / coverage,
    stageWeight: selected.map(w => w / coverage)
  };
}

// 25 一简字集合（占通用单字总字频 53.00%）
const FIXED_ONE_KEY = new Set([..."的一是在了不有和人中大为上个国我以要他时来用生到作"]);

function extractMultiwords(dictFile, pinyinMap, shape) {
  function parseReading(syllableWithTone) {
    const match = syllableWithTone.match(/^([a-z]+)([1-5])?$/);
    if (!match) return null;
    const p = match[1];
    const t = match[2] ? Number(match[2]) : 5;
    const idx = pinyinMap.get(p);
    if (idx === undefined) return null;
    return { idx, tone: t };
  }

  const w3 = [], w4 = [];
  for (const line of fs.readFileSync(dictFile, 'utf8').split(/\r?\n/)) {
    if (!line.includes('\t') || line.startsWith('#')) continue;
    const [word, reading, weightText] = line.split('\t');
    if (!word || !reading || reading.startsWith('~')) continue;
    const chars = [...word];
    const syls = reading.split(' ');
    if (chars.length !== syls.length) continue;
    const parsed = syls.map(parseReading);
    if (parsed.some(x => !x)) continue;
    if (chars.some(c => !shape[c])) continue;
    const weight = Number(weightText) || 0;
    if (weight <= 0) continue;

    const item = { text: word, py: parsed.map(p => p.idx), tones: parsed.map(p => p.tone), weight };
    if (chars.length === 3) w3.push(item);
    else if (chars.length === 4) w4.push(item);
  }

  w3.sort((a, b) => b.weight - a.weight);
  w4.sort((a, b) => b.weight - a.weight);

  return {
    w3: w3.slice(0, 15000),
    w4: w4.slice(0, 15000)
  };
}

function makeRowsForScheme(entry, data, stroke, multiwords) {
  const codes = entry.codeList;
  const toneKeys = entry.tone;
  const shape = data.shapes.snowshape;
  const is21x21 = Array.isArray(entry.capacity) && entry.capacity[0] === 21 && entry.capacity[1] === 21;

  // 1. Chars (cleaned, without 25 一简字)
  const chars_kt = [];
  const chars_sp = [];
  for (const [text, py, tone, weight, common] of data.characters) {
    if (!common || weight <= 0 || FIXED_ONE_KEY.has(text)) continue;
    const base = codes[py];
    if (!base) continue;
    const aux = physicalShape(shape[text], toneKeys);
    const toneKey = toneKeys[tone - 1];
    const possible = [...(stroke.alternatives.get(text) || [])].map(s => physicalStroke(s, toneKeys));

    chars_kt.push({
      text, weight,
      codes: [
        [base],
        aux ? [base + aux[0]] : [base],
        aux ? [base + aux.slice(0, 2)] : [base]
      ]
    });

    chars_sp.push({
      text, weight,
      codes: [
        [base],
        toneKey ? [base + toneKey] : [base],
        toneKey && possible.length ? possible.map(k => base + toneKey + k) : (toneKey ? [base + toneKey] : [base])
      ]
    });
  }

  // 2. Words2 (带权二字词, 4 码全拼 + 辅码)
  const w2_kt = [];
  const w2_sp = [];
  for (const [text, py1, py2, tone1, tone2, weight, lexicon, common] of data.words) {
    if (!(lexicon & 1) || weight <= 0 || [...text].length !== 2) continue;
    const base = codes[py1] && codes[py2] ? codes[py1] + codes[py2] : null;
    if (!base) continue;
    const [ch1, ch2] = [...text];
    const x1 = physicalShape(shape[ch1], toneKeys), x2 = physicalShape(shape[ch2], toneKeys);
    const t1 = toneKeys[tone1 - 1], t2 = toneKeys[tone2 - 1];
    const b1 = is21x21 ? x1 : x2;
    const b2 = is21x21 ? x2 : x1;

    w2_kt.push({
      text, weight,
      codes: [
        [base],
        b1 ? [base + b1[0]] : [base],
        b1 && b2 ? [base + b1[0] + b2[0]] : (b1 ? [base + b1[0]] : [base])
      ]
    });

    w2_sp.push({
      text, weight,
      codes: [
        [base],
        t2 ? [base + t2] : [base],
        t1 && t2 ? [base + t2 + t1] : (t2 ? [base + t2] : [base])
      ]
    });
  }

  // 3. Words3 (前三字声母简拼 + 辅码)
  const w3_kt = [];
  const w3_sp = [];
  for (const item of multiwords.w3) {
    const { text, py, tones, weight } = item;
    const s0 = codes[py[0]], s1 = codes[py[1]], s2 = codes[py[2]];
    if (!s0 || !s1 || !s2) continue;
    const base = s0[0] + s1[0] + s2[0];
    const chars = [...text];
    const x0 = physicalShape(shape[chars[0]], toneKeys);
    const x1 = physicalShape(shape[chars[1]], toneKeys);
    const t_aux1 = is21x21 ? toneKeys[tones[2] - 1] : toneKeys[tones[0] - 1];
    const t_aux2 = is21x21 ? toneKeys[tones[0] - 1] : toneKeys[tones[1] - 1];

    w3_kt.push({
      text, weight,
      codes: [
        [base],
        x0 ? [base + x0[0]] : [base],
        x0 && x1 ? [base + x0[0] + x1[0]] : (x0 ? [base + x0[0]] : [base])
      ]
    });

    w3_sp.push({
      text, weight,
      codes: [
        [base],
        t_aux1 ? [base + t_aux1] : [base],
        t_aux1 && t_aux2 ? [base + t_aux1 + t_aux2] : (t_aux1 ? [base + t_aux1] : [base])
      ]
    });
  }

  // 4. Words4 (前四字声母简拼 + 辅码，与二字词在 4 码编码空间直接交叉碰撞竞争)
  const w4_kt = [];
  const w4_sp = [];
  for (const item of multiwords.w4) {
    const { text, py, tones, weight } = item;
    const s0 = codes[py[0]], s1 = codes[py[1]], s2 = codes[py[2]], s3 = codes[py[3]];
    if (!s0 || !s1 || !s2 || !s3) continue;
    const base = s0[0] + s1[0] + s2[0] + s3[0];
    const chars = [...text];
    const x0 = physicalShape(shape[chars[0]], toneKeys);
    const x1 = physicalShape(shape[chars[1]], toneKeys);
    const t_aux1 = is21x21 ? toneKeys[tones[3] - 1] : toneKeys[tones[0] - 1];
    const t_aux2 = is21x21 ? toneKeys[tones[0] - 1] : toneKeys[tones[1] - 1];

    w4_kt.push({
      text, weight,
      codes: [
        [base],
        x0 ? [base + x0[0]] : [base],
        x0 && x1 ? [base + x0[0] + x1[0]] : (x0 ? [base + x0[0]] : [base])
      ]
    });

    w4_sp.push({
      text, weight,
      codes: [
        [base],
        t_aux1 ? [base + t_aux1] : [base],
        t_aux1 && t_aux2 ? [base + t_aux1 + t_aux2] : (t_aux1 ? [base + t_aux1] : [base])
      ]
    });
  }

  return {
    keytao: {
      character: chars_kt,
      word2: w2_kt,
      word3: w3_kt,
      word4: w4_kt,
    },
    sanpin: {
      character: chars_sp,
      word2: w2_sp,
      word3: w3_sp,
      word4: w4_sp,
    }
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[1/5] Loading R11 page: ${args.html}...`);
  const page = loadPage(args.html);
  const data = page.data;

  console.log('[2/5] Preparing auxiliary stroke tables & multi-character cohorts...');
  const strokeCandidates = [
    path.resolve(__dirname, '../../rime-stroke/stroke.dict.yaml'),
    path.resolve(__dirname, '../../../rime-snow-pinyin/rime-stroke/stroke.dict.yaml'),
    'D:/C2D/Documents/rime-snow-pinyin/rime-stroke/stroke.dict.yaml',
    path.resolve('rime-stroke/stroke.dict.yaml'),
  ];
  let strokeFile = strokeCandidates.find(p => fs.existsSync(p));
  if (!strokeFile) throw Error('stroke.dict.yaml not found');
  const stroke = strokeOptions(strokeFile);

  const dictCandidates = [
    path.resolve(__dirname, '../../snow_pinyin.base.dict.yaml'),
    path.resolve(__dirname, '../../../rime-snow-pinyin/snow_pinyin.base.dict.yaml'),
    'D:/C2D/Documents/rime-snow-pinyin/snow_pinyin.base.dict.yaml',
    path.resolve('snow_pinyin.base.dict.yaml'),
  ];
  let dictFile = dictCandidates.find(p => fs.existsSync(p));
  if (!dictFile) throw Error('snow_pinyin.base.dict.yaml not found');
  const pinyinMap = new Map(data.pinyin.map((p, i) => [p, i]));
  const multiwords = extractMultiwords(dictFile, pinyinMap, data.shapes.snowshape);
  console.log(`    Extracted cohorts: W3=${multiwords.w3.length}, W4=${multiwords.w4.length}`);

  console.log(`[3/5] Scoring all ${data.entries.length} schemes across 8 tracks (4 cohorts x 2 modes)...`);
  const cache = new Map();
  const schemesObj = {};
  const limit = args.limit ? Number(args.limit) : data.entries.length;
  const entriesToScore = data.entries.slice(0, limit);

  const tStart = Date.now();
  let done = 0;
  for (const entry of entriesToScore) {
    const rows = makeRowsForScheme(entry, data, stroke, multiwords);
    const modes = { keytao: {}, sanpin: {} };
    for (const mode of ['keytao', 'sanpin']) {
      for (const kind of ['character', 'word2', 'word3', 'word4']) {
        modes[mode][kind] = scoreCohort(rows[mode][kind], cache);
      }
    }
    schemesObj[entry.id] = {
      capacity: entry.capacity,
      tone: entry.tone,
      modes
    };
    done++;
    if (done % 50 === 0 || done === entriesToScore.length) {
      const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
      console.log(`    Scored ${done}/${entriesToScore.length} schemes (${elapsed}s)...`);
    }
  }

  const completionBV3 = {
    version: 'B-completion-CKT-v3-universal',
    source: 'universal-8-track-evaluator',
    policy: {
      tracks: [
        'kc1: keytao character (excluding 25 一简)',
        'kw2: keytao 2-char words',
        'kw3: keytao 3-char words',
        'kw4: keytao 4-char words',
        'sc1: sanpin character (excluding 25 一简)',
        'sw2: sanpin 2-char words',
        'sw3: sanpin 3-char words',
        'sw4: sanpin 4-char words'
      ],
      weights: { character: 1, word2: 3, word3: 1, word4: 1 },
      normalization: 'Divided by S005 at identical tau, alpha1, alpha2; fourth-power weighted mean.'
    },
    schemes: schemesObj
  };

  if (args.output) {
    fs.mkdirSync(path.dirname(args.output), { recursive: true });
    fs.writeFileSync(args.output, JSON.stringify(completionBV3, null, 2), 'utf8');
    console.log(`[4/5] Saved JSON scores to ${args.output}`);
  }

  if (args.embed || !args.output) {
    console.log('[4/5] Embedding completionBV3 and v3 UI columns into HTML...');
    data.completionBV3 = completionBV3;

    let html = page.html;

    // 1. Update/Inject UG.bCompositeV3
    const v3GlossaryCode = `UG.bCompositeV3={title:'综合补全 CKT v3 · 四阶词长闭环 · 原生五键',brief:'四阶词长闭环（单/二/三/四字，权重1:3:1:1）；二四字词同台竞争；剔除53%一简；口径自适应辅码规则（非21×21对齐飞花/神韵：二字B₂B₁、三四字B₁B₂）；原生五辅键；S005恒为10。',detail:'1. 单字：从通用规范字频中剔除 25 个固顶一简字（占 53% 字频），纯粹评估需全拼+辅码消歧的次高频与生僻字补全；声母移位 D>0 的指法转移成本已 100% 被双拼基础码 CKT 精确反映；\\n2. 二字词：选用带权 13w 词（lexicon & 1）而非 6w 词，以全量带权词频真实反映词组重码，杜绝小词表截断产生的虚假无重码；忽略声声二简词以保全基准公平；\\n3. 三字词：提取高频实词 15,000 条，3 码声母简拼直出，支持两码辅码消歧；\\n4. 四字词：提取经典成语与高频实词 15,000 条，4 码声母简拼直出，支持两码辅码消歧；四字词与二字词在 4 码编码空间直接交叉碰撞，二者此消彼长体现在码长与选重上；\\n5. 超长词（L ≥ 5）：全方案均为声母直出无碰撞，且无需额外辅码，故予以忽略，避免 Shift 换挡计费失真；\\n6. 口径自适应辅码规则与顺序：彻底消除固定 21×21 假设。21×21 口径键道二字词取首字形先（B₁B₂），三拼取次字调先（B₂B₁），三四字词取形 B₁B₂、调末首（T末T₁）；非 21×21 口径（21×26、21×28、26×26 等）全面严谨对齐飞花/神韵四码顶规范，二字词统一取次字辅码先（B₂B₁），三字词与四字词统一取首二字辅码先（形 B₁B₂、调 T₁T₂），形调规则对称统一；\\n7. 原生五辅键与四阶实测加权：直接采用方案原生 tone 五键映射与任意 capacity；权重匹配 5000 字实测最优切分词次比：单字 1、二字 3、三字 1、四字 1（即 16.7% : 50.0% : 16.7% : 16.7%），S005 恒为 10 基准锚点。',formula:'T_m,k = CKT + τ·p₂ + α₁·(1−首选率) + α₂·次辅率\\nC_v3 = 10 · [Σ_{m,k} w_k (T_m,k / T_m,k(S005))⁴ / Σ_{m,k} w_k]^(1/4)\\nw = [1, 3, 1, 1]\\n辅码顺序：21×21 二字[形B₁B₂, 调B₂B₁] 三四字[形B₁B₂, 调T末T₁]；非21×21 二字[形B₂B₁, 调B₂B₁] 三四字[形B₁B₂, 调T₁T₂]',direction:'同参数下越低越好',related:['bCompositeV2','bComposite0','selectioncost'],sources:['cktV2','completionBV3'],controls:['uxTau','uxFirstAuxPenalty','uxSecondAuxPenalty']};\n`;

    if (html.includes('UG.bCompositeV3=')) {
      html = html.replace(/UG\.bCompositeV3=\{[\s\S]*?\};\r?\n/, v3GlossaryCode);
    } else {
      const v2GlossaryAnchor = "UG.bCompositeV2={";
      html = html.replace(v2GlossaryAnchor, v3GlossaryCode + v2GlossaryAnchor);
    }

    // 2. Update methods dictionary entry
    const v3Vers = "[uxTerm('bCompositeV3','综合补全 CKT v3（四阶词长闭环）'),Object.keys(D.completionBV3?.schemes||{}).length,'B-completion-CKT-v3-universal','S005固定锚点·原生五键·去一简·四阶实测加权'],";
    if (html.includes("'bCompositeV3'")) {
      html = html.replace(/\[uxTerm\('bCompositeV3'[\s\S]*?\],/, v3Vers);
    } else {
      const versAnchor = "[uxTerm('bComposite0','综合补全CKT（字:词=1:2）')";
      html = html.replace(versAnchor, v3Vers + versAnchor);
    }

    // 3. Update/Inject JS functions and UI tracks
    const v3Funcs = `function bCompletionV3Row(e){return D.completionBV3?.schemes?.[e.id]?.modes||null}
const B_COMPLETION_TRACKS_V3=[
  ['kc1','键道·单字(去一简)','keytao','character',1,2],
  ['kw2','键道·二字词','keytao','word2',3,4],
  ['kw3','键道·三字词','keytao','word3',1,3],
  ['kw4','键道·四字词','keytao','word4',1,4],
  ['sc1','三拼·单字(去一简)','sanpin','character',1,2],
  ['sw2','三拼·二字词','sanpin','word2',3,4],
  ['sw3','三拼·三字词','sanpin','word3',1,3],
  ['sw4','三拼·四字词','sanpin','word4',1,4]
];
function bCompletionScoreV3(m,tau,firstAux,secondAux,reference){
  if(!m||!reference)return null;
  let sum=0,total=0;
  for(const [, ,mode,kind,weight,base] of B_COMPLETION_TRACKS_V3){
    const r=m[mode]?.[kind],b=reference[mode]?.[kind];
    if(!r||!b)return null;
    const f=1-(r.stageWeight?.[0]??1),bf=1-(b.stageWeight?.[0]??1);
    const f2=Math.max(0,r.meanKeys-base-f),bf2=Math.max(0,b.meanKeys-base-bf);
    const a=r.completionUpperMs+tau*r.p2+firstAux*f+secondAux*f2;
    const c=b.completionUpperMs+tau*b.p2+firstAux*bf+secondAux*bf2;
    if(!(a>0&&c>0))return null;
    sum+=weight*(a/c)**4;
    total+=weight;
  }
  return 10*(sum/total)**.25;
}\n`;

    if (html.includes('function bCompletionScoreV3')) {
      html = html.replace(/function bCompletionV3Row\(e\)[\s\S]*?return 10\*\(sum\/total\)\*\*\.25;\s*\}\n/, v3Funcs);
    } else {
      const v2FuncAnchor = "function bCompletionScoreV2(m,tau,firstAux,secondAux,reference){";
      html = html.replace(v2FuncAnchor, v3Funcs + v2FuncAnchor);
    }

    // 4. Update/Inject UI header column and row calculations
    if (html.includes("help:'bCompositeV3'")) {
      html = html.replace(/\{label:'综合补全 CKT v3[^']*',help:'bCompositeV3'\},/, "{label:'综合补全 CKT v3 · 四阶词长 · 原生五键 · ×10',help:'bCompositeV3'},");
    } else {
      const v2Header = "{label:'综合补全 CKT v2 · 固定 IVUAO · 字:词=1:2 · ×10',help:'bCompositeV2'},";
      const v3Header = "{label:'综合补全 CKT v2 · 固定 IVUAO · 字:词=1:2 · ×10',help:'bCompositeV2'},{label:'综合补全 CKT v3 · 四阶词长 · 原生五键 · ×10',help:'bCompositeV3'},";
      html = html.replace(v2Header, v3Header);

      const v2RowAnchor = "v2M=bCompletionV2Row(e),v2Score=bCompletionScoreV2(v2M,tau,bCompletionFirstAuxPenalty(),bCompletionSecondAuxPenalty(),bCompletionV2Row({id:'S005'})),scoreTau=bCompletionScore(m,tau);";
      const v3Row = "v2M=bCompletionV2Row(e),v2Score=bCompletionScoreV2(v2M,tau,bCompletionFirstAuxPenalty(),bCompletionSecondAuxPenalty(),bCompletionV2Row({id:'S005'})),v3M=bCompletionV3Row(e),v3Score=bCompletionScoreV3(v3M,tau,bCompletionFirstAuxPenalty(),bCompletionSecondAuxPenalty(),bCompletionV3Row({id:'S005'})),scoreTau=bCompletionScore(m,tau);";
      html = html.replace(v2RowAnchor, v3Row);

      const v2BaseAnchor = "fixedWord2,v2Score,scoreTau";
      const v3Base = "fixedWord2,v2Score,v3Score,scoreTau";
      html = html.replace(v2BaseAnchor, v3Base);

      const v2NumAnchor = "num(v2Score,5),num(scoreTau,5)";
      const v3Num = "num(v2Score,5),num(v3Score,5),num(scoreTau,5)";
      html = html.replace(v2NumAnchor, v3Num);
    }

    // 5. Update/Inject CKT v3 section in cktReport panel
    const v3SectionHtml = `<h3>综合补全 CKT v3：四阶词长闭环评估与词典收录准则</h3>
<div class="two">
  <div class="card">
    <h4>① 词典准入与 4 码空间交叉碰撞</h4>
    <p><b>二字词与四字词同台竞争</b>：二字词（4 码全拼）与四字词（4 码简拼）共享 4 码编码空间，发生真实的同码竞争。两者的此消彼长完全体现在各自的平均码长（是否需追加辅码）与选重耗时上。二字词采用全量带权 13w 词库；四字词准入高频成语与复合实词 15,000 条；三字词准入高频实词 15,000 条。</p>
    <p><b>忽略四字词以上（L ≥ 5）</b>：五字及以上专有名词在各方案中均为纯声母简码直出，不存在跨阶编码碰撞与辅码消歧，全方案等价；忽略超长词可免除 Shift 换挡计费的模型外推争议，精简算力。</p>
  </div>
  <div class="card">
    <h4>② 一简字处理与四阶词长权重</h4>
    <p><b>单字剔除 25 个固顶一简</b>：25 个一简字在实际语料中独占单字总频次的 53.00%，且在各方案中均单键直接上屏无需消歧；剔除后纯粹考核剩余 47% 汉字的全拼+辅码消歧能力。声母移位 D&gt;0 带来的物理击键优劣，已 100% 被双拼基础码 CKT 转移耗时精确刻画，无需且不应变成方案-specific 剔除集合（避免测试集污染）。</p>
    <p><b>实测四阶词长加权 [1, 3, 1, 1]</b>：基于 5000 字通用长文最优切分词次比（单字 16.7%、二字 50.0%、三字 16.7%、四字 16.7%），总权重 6，形成高精度的四阶闭环。</p>
  </div>
  <div class="card">
    <h4>③ 口径自适应辅码规则与字位顺序</h4>
    <p><b>21×21 口径（键道/三拼传统规范）</b>：二字词键道形码取首字先（B₁B₂）、三拼调码取次字先（B₂B₁）；三字词与四字词形码取首二字（B₁B₂）、调码取末字+首字（三字词 T₃T₁、四字词 T₄T₁）。</p>
    <p><b>非 21×21 口径（飞花/神韵·形/调对称规范）</b>：全面贯彻飞花/神韵标准。二字词统一取次字辅码先（B₂B₁）；三字词与四字词统一取首二字辅码先（形码 B₁B₂、调码 T₁T₂）。形码与调码规则完全对称一致，极大降低认知记忆负荷。</p>
  </div>
  <div class="card">
    <h4>④ 原生五辅键与 S005 固定锚点闭环</h4>
    <p><b>彻底解除固定 IVUAO 假设</b>：直接提取各方案原生的 tone 五键物理键位与实际 capacity（21×21、21×26、21×28、23×23、26×26 等），原生评估指法成本与碰撞。</p>
    <p><b>S005 恒定 10.00000 基准锚点</b>：无论 τ、α₁、α₂ 如何调节，基准方案 S005 在同参数下四阶 8 轨道归一后恒为 10.00000，所有口径方案的分数均基于此高灵敏度对比，越低越好。</p>
  </div>
</div>
`;

    if (html.includes('<h3>综合补全 CKT v3：')) {
      html = html.replace(/<h3>综合补全 CKT v3：[\s\S]*?<\/div>\s*<\/div>\s*/, v3SectionHtml);
    } else {
      const reportAnchor = '<p class="warning">公开仓库会继续更新，本页使用的是嵌入快照；';
      html = html.replace(reportAnchor, v3SectionHtml + reportAnchor);
    }

    // 6. Re-compress payload
    console.log('[5/5] Re-encoding payload and writing to HTML file...');
    const encoded = base64Gzip(JSON.stringify(data));
    const payloadRegex = /(<script id="payload"[^>]*>)([^<]+)(<\/script>)/;
    html = html.replace(payloadRegex, `$1${encoded}$3`);
    fs.writeFileSync(args.html, html, 'utf8');
    console.log(`Successfully updated and embedded CKT v3 into ${args.html}`);
  }
}

function base64Gzip(str) {
  return zlib.gzipSync(Buffer.from(str, 'utf8'), { mtime: 0 }).toString('base64');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
