#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const {DEFAULT_COGNITIVE_PRIOR: DEFAULT_COGNITIVE_PARAMETERS} = require('./ckt_v4_model.js');

const TRACKS = [
  ['keytao', 'character', 1], ['keytao', 'word2', 3],
  ['keytao', 'word3', 1], ['keytao', 'word4', 1],
  ['sanpin', 'character', 1], ['sanpin', 'word2', 3],
  ['sanpin', 'word3', 1], ['sanpin', 'word4', 1],
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return args;
}

function payloadRange(html) {
  const at = html.indexOf('<script id="payload"');
  if (at < 0) throw new Error('HTML payload not found');
  const start = html.indexOf('>', at) + 1;
  const end = html.indexOf('</script>', start);
  return {start, end};
}

function replaceRequired(html, before, after, label) {
  if (!html.includes(before)) throw new Error(`cannot install CKT v4 UI: missing ${label}`);
  return html.replace(before, after);
}

function installFrontend(html) {
  const glossary = "UG.bCompositeV4={title:'综合补全 CKT v4 · 联合竞争池 · 上游串击当量',brief:'21×21 联合二/四字池；非 21×21 还将 AAA 未直出的三字词以 AAAU 路由加入四码联合池。冰雪 99% 词频质量、34 键域、字词 1:3:1:1，S005 恒为 10。',detail:'运动项采用上游 e37cbcfe 的 2/3/4 键角色表；5/6 键为同角色表连续窗口外推。认知项分离为辅码、固定选重决策、逐个视觉排除和翻页；默认 β=50 ms/候选、P=9、γpage=300 ms，均是待实验标定的工程先验。',formula:'A=α₁b₁+α₂b₂+I(r>1)[τ+β(r−1)+γsel]+γpage⌊(r−1)/P⌋\\nT=M上游+E[A]；C_v4=10·[Σw(T/T_S005)⁴/Σw]^(1/4)，w=[1,3,1,1]',direction:'仅在同一参数情景下比较，越低越好',related:['bCompositeV3','selectioncost','evidence'],sources:['completionBV4'],controls:['uxTau','uxFirstAuxPenalty','uxSecondAuxPenalty']};" + '\n';
  if (!html.includes('UG.bCompositeV4=')) {
    html = replaceRequired(html, 'UG.bCompositeV2=', glossary + 'UG.bCompositeV2=', 'v4 glossary anchor');
  } else if (!html.includes('逐个视觉排除和翻页')) {
    html = html.replace(/UG\.bCompositeV4=\{[\s\S]*?\};\n(?=UG\.bCompositeV2=)/, glossary);
    if (!html.includes('逐个视觉排除和翻页')) throw new Error('cannot upgrade CKT v4 glossary');
  }
  const functions = `function bCompletionV4Row(e){return D.completionBV4?.schemes?.[e.id]?.modes||null}
function bCompletionScoreV4(m,tau,firstAux,secondAux,reference){
  if(!m||!reference)return null;let sum=0,total=0;const p=D.completionBV4?.cognitiveDefaults||{},scan=Number(p.scanPerCandidateMs||0),select=Number(p.selectionActionMs||0),page=Number(p.pageActionMs||0);
  for(const [, ,mode,kind,weight] of B_COMPLETION_TRACKS_V3){const r=m[mode]?.[kind],b=reference[mode]?.[kind];if(!r||!b)return null;const time=x=>x.motorUpperMs+firstAux*x.firstAuxRate+secondAux*x.secondAuxRate+(tau+select)*x.selectionRate+scan*(x.meanRejectedCandidates??(Number.isFinite(x.meanTerminalRank)?Math.max(0,x.meanTerminalRank-1):0))+page*(x.meanPageActions||0),a=time(r),c=time(b);if(!(a>0&&c>0))return null;sum+=weight*(a/c)**4;total+=weight}
  return 10*(sum/total)**.25;
}
`;
  if (!html.includes('function bCompletionV4Row')) {
    html = replaceRequired(html, 'function bCompletionScoreV2(', functions + 'function bCompletionScoreV2(', 'v4 score function anchor');
  } else if (!html.includes('meanRejectedCandidates??')) {
    html = html.replace(/function bCompletionV4Row\(e\)\{[\s\S]*?\n\}\n(?=function bCompletionScoreV2\()/, functions);
    if (!html.includes('meanRejectedCandidates??')) throw new Error('cannot upgrade CKT v4 realtime rank model');
  }
  if (!html.includes("help:'bCompositeV4'")) {
    const v3Header = "{label:'综合补全 CKT v3 · 四阶词长 · 原生五键 · ×10',help:'bCompositeV3'},";
    html = replaceRequired(html, v3Header, v3Header + "{label:'综合补全 CKT v4 · 联合池 · 上游串击 · ×10',help:'bCompositeV4'},", 'v4 table header');
  }
  if (!html.includes('v4Score=bCompletionScoreV4')) {
    html = replaceRequired(html, ')),scoreTau=bCompletionScore(m,tau);', ")),v4M=bCompletionV4Row(e),v4Score=bCompletionScoreV4(v4M,tau,bCompletionFirstAuxPenalty(),bCompletionSecondAuxPenalty(),bCompletionV4Row({id:'S005'})),scoreTau=bCompletionScore(m,tau);", 'v4 row calculation');
    html = replaceRequired(html, 'v2Score,v3Score,scoreTau];', 'v2Score,v3Score,v4Score,scoreTau];', 'v4 raw cell');
    html = replaceRequired(html, 'num(v2Score,5),num(v3Score,5),num(scoreTau,5),', 'num(v2Score,5),num(v3Score,5),num(v4Score,5),num(scoreTau,5),', 'v4 display cell');
  }
  return html;
}

function compactModes(modes) {
  return Object.fromEntries(Object.entries(modes).map(([mode, kinds]) => [mode,
    Object.fromEntries(Object.entries(kinds).map(([kind, row]) => [kind, row && {
      count: row.count,
      totalWeight: row.totalWeight,
      motorUpperMs: row.motorUpperMs,
      firstAuxRate: row.firstAuxRate,
      secondAuxRate: row.secondAuxRate,
      selectionRate: row.selectionRate,
      meanTerminalRank: row.meanTerminalRank,
      meanRejectedCandidates: row.meanRejectedCandidates ?? Math.max(0, row.meanTerminalRank - 1),
      meanPageActions: row.meanPageActions ?? 0,
      meanKeys: row.meanKeys,
    }]))
  ]));
}

function score(modes, reference, parameters) {
  const p = {...DEFAULT_COGNITIVE_PARAMETERS, ...parameters};
  let sum = 0;
  let total = 0;
  for (const [mode, kind, weight] of TRACKS) {
    const a = modes[mode][kind];
    const b = reference[mode][kind];
    const time = row => row.motorUpperMs
      + p.firstAuxMs * row.firstAuxRate
      + p.secondAuxMs * row.secondAuxRate
      + (p.selectionDecisionMs + p.selectionActionMs) * row.selectionRate
      + p.scanPerCandidateMs * (row.meanRejectedCandidates
        ?? (Number.isFinite(row.meanTerminalRank) ? Math.max(0, row.meanTerminalRank - 1) : 0))
      + p.pageActionMs * (row.meanPageActions ?? 0);
    sum += weight * (time(a) / time(b)) ** 4;
    total += weight;
  }
  return 10 * (sum / total) ** 0.25;
}

function ranks(values) {
  return Object.fromEntries(Object.entries(values)
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([id], index) => [id, index + 1]));
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}

function compareSettings(baseValues, variantValues) {
  const ids = Object.keys(baseValues);
  const aRanks = ranks(baseValues);
  const bRanks = ranks(variantValues);
  const deltas = ids.map(id => Math.abs(variantValues[id] - baseValues[id]));
  const rankDeltaSquared = ids.reduce((sum, id) => sum + (aRanks[id] - bRanks[id]) ** 2, 0);
  const largestId = ids.reduce((best, id) => Math.abs(variantValues[id] - baseValues[id])
    > Math.abs(variantValues[best] - baseValues[best]) ? id : best, ids[0]);
  const top = (values, count) => new Set(Object.keys(ranks(values)).sort((a, b) => ranks(values)[a] - ranks(values)[b]).slice(0, count));
  const topA = top(baseValues, 20);
  const topB = top(variantValues, 20);
  return {
    medianAbsoluteScoreChange: percentile(deltas, 0.5),
    p95AbsoluteScoreChange: percentile(deltas, 0.95),
    maximumAbsoluteScoreChange: Math.abs(variantValues[largestId] - baseValues[largestId]),
    maximumChangeScheme: largestId,
    maximumSignedScoreChange: variantValues[largestId] - baseValues[largestId],
    schemesWithChangedOrdinalRank: ids.filter(id => aRanks[id] !== bRanks[id]).length,
    schemesCrossingS005Anchor: ids.filter(id => (baseValues[id] < 10) !== (variantValues[id] < 10)).length,
    top20Overlap: [...topA].filter(id => topB.has(id)).length,
    spearmanOrdinal: 1 - 6 * rankDeltaSquared / (ids.length * (ids.length ** 2 - 1)),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = path.resolve(__dirname, '..');
  const htmlFile = path.resolve(args.html || path.join(repo, 'a7_CKT_R11.html'));
  const partsDir = path.resolve(args.parts || '.');
  const auditFile = path.resolve(args.audit || path.join(repo, 'docs', 'CKT_v4_ALL_SCHEMES_VALIDATION.json'));
  const resultsFile = path.resolve(args.results || path.join(repo, 'docs', 'CKT_v4_ALL_SCHEMES_RESULTS.json'));
  const partFiles = fs.readdirSync(partsDir).filter(name => /^part-\d+\.json$/.test(name)).sort();
  if (!partFiles.length) throw new Error(`no part JSON files in ${partsDir}`);
  const parts = partFiles.map(name => JSON.parse(fs.readFileSync(path.join(partsDir, name), 'utf8')));

  const html = installFrontend(fs.readFileSync(htmlFile, 'utf8'));
  const range = payloadRange(html);
  const data = JSON.parse(zlib.gunzipSync(Buffer.from(html.slice(range.start, range.end), 'base64')));
  const expected = new Set(data.entries.map(entry => entry.id));
  if (expected.size !== data.entries.length) throw new Error('HTML entries contain duplicate scheme IDs');
  const schemes = {};
  const first = parts[0];
  for (const part of parts) {
    for (const field of ['version', 'upstream', 'keyDomain', 'corpus', 'cognitiveParameters']) {
      if (JSON.stringify(part[field]) !== JSON.stringify(first[field])) {
        throw new Error(`part metadata mismatch: ${field}`);
      }
    }
    for (const [id, scheme] of Object.entries(part.schemes)) {
      if (schemes[id]) throw new Error(`duplicate scheme ${id}`);
      schemes[id] = {capacity: scheme.capacity, contract: scheme.contract, modes: compactModes(scheme.modes)};
    }
  }
  const actual = new Set(Object.keys(schemes));
  const missing = [...expected].filter(id => !actual.has(id));
  const extra = [...actual].filter(id => !expected.has(id));
  if (missing.length || extra.length || expected.size !== actual.size) {
    throw new Error(`scheme coverage mismatch: expected=${expected.size}, actual=${actual.size}, missing=${missing.slice(0, 10)}, extra=${extra.slice(0, 10)}`);
  }
  if (!schemes.S005) throw new Error('S005 reference is missing');

  data.completionBV4 = {
    version: 'completion-ckt-v4-rank-cognition-2',
    upstream: first.upstream,
    keyDomain: first.keyDomain,
    corpus: first.corpus,
    cognitiveDefaults: first.cognitiveParameters,
    aggregation: {kindWeights: {character: 1, word2: 3, word3: 1, word4: 1}, power: 4, anchor: 'S005=10'},
    contracts: {
      'traditional-21x21': 'word2+word4 joint at 4/5/6; word3 isolated at 3/4/5',
      'four-code-top': 'word3 AAA winners commit early; residual AAAU joins word2+word4 at 4/5/6',
    },
    caveats: first.caveats,
    schemes,
  };
  fs.writeFileSync(resultsFile, `${JSON.stringify(data.completionBV4, null, 2)}\n`, 'utf8');

  const encoded = zlib.gzipSync(Buffer.from(JSON.stringify(data)), {level: 9}).toString('base64');
  fs.writeFileSync(htmlFile, html.slice(0, range.start) + encoded + html.slice(range.end), 'utf8');

  const baseline = {...DEFAULT_COGNITIVE_PARAMETERS, ...first.cognitiveParameters};
  const settings = {
    rankAwareDefault: baseline,
    historical300_300_600: {...baseline, scanPerCandidateMs: 0, selectionActionMs: 0, pageActionMs: 0},
    motorOnly0_0_0: {...baseline, firstAuxMs: 0, secondAuxMs: 0, selectionDecisionMs: 0, scanPerCandidateMs: 0, selectionActionMs: 0, pageActionMs: 0},
    noFirst0_300_600: {...baseline, firstAuxMs: 0},
    noSecond300_0_600: {...baseline, secondAuxMs: 0},
    noSelection300_300_0: {...baseline, selectionDecisionMs: 0, scanPerCandidateMs: 0, selectionActionMs: 0, pageActionMs: 0},
  };
  const values = Object.fromEntries(Object.entries(settings).map(([name, parameters]) => [name,
    Object.fromEntries(Object.entries(schemes).map(([id, scheme]) => [id,
      score(scheme.modes, schemes.S005.modes, parameters)]))
  ]));
  const base = values.rankAwareDefault;
  const historical = values.historical300_300_600;
  const contractSensitivity = Object.fromEntries([...new Set(Object.values(schemes)
    .map(scheme => scheme.contract))].sort().map(contract => {
    const ids = Object.keys(schemes).filter(id => schemes[id].contract === contract);
    return [contract, compareSettings(
      Object.fromEntries(ids.map(id => [id, base[id]])),
      Object.fromEntries(ids.map(id => [id, historical[id]])),
    )];
  }));
  const validation = {
    version: data.completionBV4.version,
    schemeCoverage: {expected: expected.size, actual: actual.size, complete: expected.size === actual.size},
    contracts: Object.fromEntries(Object.entries(schemes).reduce((map, [, scheme]) =>
      map.set(scheme.contract, (map.get(scheme.contract) || 0) + 1), new Map())),
    corpus: first.corpus,
    upstream: first.upstream,
    anchorChecks: Object.fromEntries(Object.entries(values).map(([name, rows]) => [name, rows.S005])),
    sliderSensitivityAgainstDefault: Object.fromEntries(Object.entries(values)
      .filter(([name]) => name !== 'rankAwareDefault')
      .map(([name, rows]) => [name, compareSettings(base, rows)])),
    rankCognitionSensitivityByContract: contractSensitivity,
    scoreExtremesAtDefault: Object.entries(base).sort((a, b) => a[1] - b[1]).slice(0, 20)
      .map(([id, value], index) => ({rank: index + 1, id, score: value})),
  };
  fs.writeFileSync(auditFile, `${JSON.stringify(validation, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({htmlFile, auditFile, resultsFile, parts: partFiles.length, schemes: actual.size,
    payloadBytes: Buffer.byteLength(JSON.stringify(data)), compressedBase64Bytes: encoded.length}));
}

if (require.main === module) main();

module.exports = {installFrontend, score, compareSettings};
