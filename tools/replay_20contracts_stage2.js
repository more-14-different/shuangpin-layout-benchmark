const fs = require('fs');
const zlib = require('zlib');
const vm = require('vm');

console.log("=== Stage 2: 20-Contract Exact Replay & Pareto Analysis ===");

// 1. Load HTML engine and payload
const html = fs.readFileSync('a7_CKT_R11.html', 'utf8');
const marker = '<script id="payload"';
const start = html.indexOf(marker);
const tagEnd = html.indexOf('>', start) + 1;
const end = html.indexOf('</script>', tagEnd);
const b64 = html.slice(tagEnd, end);
const D = JSON.parse(zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8'));

const engineMarker = 'function project(a,M)';
const scriptStart = html.lastIndexOf('<script', html.indexOf(engineMarker));
const scriptEnd = html.indexOf('</script>', html.indexOf(engineMarker));
const scriptCode = html.slice(html.indexOf('>', scriptStart) + 1, scriptEnd);

const context = { console, Float64Array, Int32Array, Map, Math, Number, String, Array, Object, D, window: {}, globalThis: {} };
context.window = context; context.globalThis = context;
vm.createContext(context);
vm.runInContext(scriptCode, context);
const Engine7 = context.Engine7;
Engine7.init(D);

const ALPHABET = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '[', ']', '\\', ';', '\'', ',', '.', '/'];
const HEADS = ['b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'zh', 'ch', 'sh', 'r', 'z', 'c', 's', 'A', 'E', 'O', 'W', 'Y', 'YU'];
const FINALS = ['a', 'ai', 'an', 'ang', 'ao', 'e', 'ei', 'en', 'eng', 'er', 'i', 'ia', 'ian', 'iang', 'iao', 'ie', 'in', 'ing', 'iong', 'iu', 'o', 'ong', 'ou', 'u', 'ua', 'uai', 'uan', 'uang', 'ui', 'un', 'uo', 'v', 'van', 've', 'vn'];

function splitPinyin(py) {
  const consonants = HEADS.slice(0, 21).sort((a, b) => b.length - a.length);
  let head = '', final = '';
  if ('aeo'.includes(py[0])) { head = py[0].toUpperCase(); final = py; }
  else if (py.startsWith('y')) { head = ['yu', 'yuan', 'yue', 'yun'].includes(py) ? 'YU' : 'Y'; final = py.slice(1); }
  else if (py.startsWith('w')) { head = 'W'; final = py.slice(1); }
  else { for (const c of consonants) { if (py.startsWith(c)) { head = c; break; } } final = py.slice(head.length); }
  if (['j', 'q', 'x', 'Y', 'YU'].includes(head) && final.startsWith('u')) { final = 'v' + final.slice(1); }
  return [HEADS.indexOf(head), FINALS.indexOf(final)];
}

const pinyinSplits = D.pinyin.map(splitPinyin);

const target_head_keys = [
  1, 15, 12, 5, 3, 19, 13, 4, 6, 15, 7, 9, 16, 23, 10, 18, 11, 17, 25, 2, 18, 17, 2, 17, 22, 24, 24,
];
const tone_keys = [8, 21, 20, 0, 14]; // IVUAO

function buildEntryFromFinals(id, finalKeys) {
  const codeList = D.pinyin.map((py, i) => {
    const [hIdx, fIdx] = pinyinSplits[i];
    if (hIdx === -1 || fIdx === -1) return null;
    return ALPHABET[target_head_keys[hIdx]] + ALPHABET[finalKeys[fIdx]];
  });
  const tone = tone_keys.map(t => ALPHABET[t]).join('');
  return { id, name: id, codeList, tone, capacity: [21, 21] };
}

const trackOptions = [
  { track: 'S2', opt: { dataset: 'sound', cohort: 'common', boundary: 'none' } },
  { track: 'C2', opt: { dataset: 'chars', contract: 'P', cohort: 'common', boundary: 'none' } },
  { track: 'C3', opt: { dataset: 'chars', contract: 'T', cohort: 'common', boundary: 'none' } },
  { track: 'C4-Snow', opt: { dataset: 'chars', contract: 'X2', shape: 'snowshape', cohort: 'common', boundary: 'none' } },
  { track: 'C4-SBxh', opt: { dataset: 'chars', contract: 'X2', shape: 'sbxh2', cohort: 'common', boundary: 'none' } },
  { track: 'C4-SBzr', opt: { dataset: 'chars', contract: 'X2', shape: 'sbzr2', cohort: 'common', boundary: 'none' } },
  { track: 'C5-TX2', opt: { dataset: 'chars', contract: 'TX2', cohort: 'common', boundary: 'none' } },
  { track: 'W4-Snow', opt: { dataset: 'words', contract: 'P', lexicon: 'snow', cohort: 'common', boundary: 'none' } },
  { track: 'W4-SBxh', opt: { dataset: 'words', contract: 'P', lexicon: 'sbxh', cohort: 'common', boundary: 'none' } },
  { track: 'W4-SBzr', opt: { dataset: 'words', contract: 'P', lexicon: 'sbzr', cohort: 'common', boundary: 'none' } },
  { track: 'W4-common', opt: { dataset: 'words', contract: 'P', lexicon: 'common', cohort: 'common', boundary: 'none' } },
  { track: 'W4-union', opt: { dataset: 'words', contract: 'P', lexicon: 'union', cohort: 'common', boundary: 'none' } },
  { track: 'W6-Snow', opt: { dataset: 'words', contract: 'T', lexicon: 'snow', order: '12', cohort: 'common', boundary: 'none' } },
  { track: 'W6-21', opt: { dataset: 'words', contract: 'T', lexicon: 'snow', order: '21', cohort: 'common', boundary: 'none' } },
  { track: 'WX-Snow-12', opt: { dataset: 'words', contract: 'X2', shape: 'snowshape', lexicon: 'snow', order: '12', cohort: 'common', boundary: 'none' } },
  { track: 'WX-Snow-21', opt: { dataset: 'words', contract: 'X2', shape: 'snowshape', lexicon: 'snow', order: '21', cohort: 'common', boundary: 'none' } },
  { track: 'WX-SBxh-12', opt: { dataset: 'words', contract: 'X2', shape: 'sbxh2', lexicon: 'snow', order: '12', cohort: 'common', boundary: 'none' } },
  { track: 'WX-SBxh-21', opt: { dataset: 'words', contract: 'X2', shape: 'sbxh2', lexicon: 'snow', order: '21', cohort: 'common', boundary: 'none' } },
  { track: 'WX-SBzr-12', opt: { dataset: 'words', contract: 'X2', shape: 'sbzr2', lexicon: 'snow', order: '12', cohort: 'common', boundary: 'none' } },
  { track: 'WX-SBzr-21', opt: { dataset: 'words', contract: 'X2', shape: 'sbzr2', lexicon: 'snow', order: '21', cohort: 'common', boundary: 'none' } }
];

// Baseline metrics for A7-1a16aa:
const BASELINE_1A16AA = {
  id: 'A7-1a16aa',
  ckt: 9.5764,
  qaz: 0.16717,
  p: 0.04251,
  maxFinger: 0.26267,
  s2Home: 0.54457,
  homeFloor: 0.35985,
  tyb: 0.14101,
  s2Sfb: 0.04110,
  max20Sfb: 0.07898
};

// Load candidates
const candPath = 'research/exploration/a7-1a16aa-directed-20261108/stage1_candidates.json';
if (!fs.existsSync(candPath)) {
  console.log("No stage1_candidates.json found yet.");
  process.exit(0);
}

const candidates = JSON.parse(fs.readFileSync(candPath, 'utf8'));
console.log(`Loaded ${candidates.length} Stage 1 candidates.`);

if (candidates.length === 0) {
  console.log("Stage 1 candidate pool is currently empty. Run directed search first.");
  process.exit(0);
}

const evaluated = [];

for (let i = 0; i < candidates.length; i++) {
  const c = candidates[i];
  const entry = buildEntryFromFinals(c.state_key.slice(0, 14), c.final_keys);
  
  // Replay across 20 contracts
  const trackResults = {};
  let sfbList = [];
  for (const { track, opt } of trackOptions) {
    const res = Engine7.evaluate(entry, opt);
    trackResults[track] = { sfb: res.sfb, home: res.home, rightPinky: res.rightPinky, maxFinger: res.maxFinger };
    sfbList.push(res.sfb);
  }
  const s2Sfb = trackResults['S2'].sfb;
  const max20Sfb = Math.max(...sfbList);

  const fullMetrics = {
    stateKey: c.state_key,
    ckt: c.ckt_v4,
    qaz: c.qaz_peak,
    p: c.p_peak,
    maxFinger: c.max_finger_peak,
    s2Home: c.s2_home,
    homeFloor: c.home_floor,
    tyb: c.tyb_peak,
    s2Sfb: s2Sfb,
    max20Sfb: max20Sfb,
    memory: c.memory,
    displacedInitials: c.displaced_initials,
    displacedVowels: c.displaced_vowels,
    seedId: c.seed_id,
    temperature: c.temperature
  };
  evaluated.push(fullMetrics);
}

// Compare each against A7-1a16aa
console.log("\n========================================================");
console.log(" Evaluation vs A7-1a16aa Baseline");
console.log("========================================================");

const strictDominators = [];
const speedTradeoffs = [];
const robustHighHome = [];

for (const e of evaluated) {
  // Check dominance:
  // Wins or equals on all 9:
  // CKT (<=), QAZ (<=), P (<=), MaxF (<=), S2Home (>=), HomeFloor (>=), TYB (<=), S2Sfb (<=), Max20Sfb (<=)
  const cktWin = e.ckt <= BASELINE_1A16AA.ckt;
  const qazWin = e.qaz <= BASELINE_1A16AA.qaz + 1e-5;
  const pWin = e.p <= BASELINE_1A16AA.p + 1e-5;
  const maxFWin = e.maxFinger <= BASELINE_1A16AA.maxFinger + 1e-5;
  const s2HomeWin = e.s2Home >= BASELINE_1A16AA.s2Home - 1e-5;
  const hfWin = e.homeFloor >= BASELINE_1A16AA.homeFloor - 1e-5;
  const tybWin = e.tyb <= BASELINE_1A16AA.tyb + 1e-5;
  const s2SfbWin = e.s2Sfb <= BASELINE_1A16AA.s2Sfb + 1e-5;
  const max20SfbWin = e.max20Sfb <= BASELINE_1A16AA.max20Sfb + 1e-5;

  const wins = [cktWin, qazWin, pWin, maxFWin, s2HomeWin, hfWin, tybWin, s2SfbWin, max20SfbWin];
  const winCount = wins.filter(Boolean).length;

  if (winCount === 9) {
    strictDominators.push(e);
  }

  // CKT < 9.5764 with <= 1 ergonomic regression
  if (e.ckt < BASELINE_1A16AA.ckt && winCount >= 8) {
    speedTradeoffs.push({ ...e, winCount });
  }

  // CKT < 9.56 with P <= 4.5% and homeFloor >= 35.5%
  if (e.ckt < 9.5600 && e.p <= 0.0450 && e.homeFloor >= 0.3550) {
    robustHighHome.push(e);
  }
}

console.log(`Total Candidates Evaluated: ${evaluated.length}`);
console.log(`Strictly Dominating 1a16aa: ${strictDominators.length}`);
console.log(`CKT < 9.5764 with <= 1 regression: ${speedTradeoffs.length}`);
console.log(`CKT < 9.56 with P <= 4.5% & HF >= 35.5%: ${robustHighHome.length}`);

// Save complete Stage 2 replay
fs.writeFileSync(
  'research/exploration/a7-1a16aa-directed-20261108/stage2_evaluated.json',
  JSON.stringify(evaluated, null, 2)
);
console.log("Saved stage2_evaluated.json");
