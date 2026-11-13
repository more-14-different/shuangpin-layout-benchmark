'use strict';
const SNOW_QUERY = typeof module !== 'undefined' ? require('./unified_keyboard_query.js') : UnifiedKeyboardQuery;

// Shared by the offline atlas and Node tests. Tone 5 is internal; the UI uses 0.
const SNOW_TONED_TRACK_WEIGHTS = Object.freeze({character: 1, word2: 3, word3: 1, word4: 1});
const SNOW_RHYME_COLORS = Object.freeze({
  'a-ou': '#a84944', 'en-n': '#78602a', 'e-ei': '#556d9b',
  'eng-ai-v': '#825699', an: '#397f69', ang: '#ad632d',
  u: '#438098', 'i-er': '#a54f7a', 'o-ong': '#778132', ao: '#6853a0',
});
const SNOW_TONE_FILLS = Object.freeze({'4': '#d8e9f3', '23': '#dcefdc', '01': '#f5e8bd'});
const SNOW_SHAPE_PALETTE = Object.freeze({keyFill: '#e8d8f5', badgeFill: '#f4eafb', stroke: '#a080b7', ink: '#684780'});

function snowNormalizeQuery(value) {
  return String(value || '').toLowerCase().replace(/u:|ü/g, 'v')
    .replace(/5/g, '0').replace(/[\s'’·-]+/g, '');
}

function snowKeyboardEntry(native) {
  const roles = Object.fromEntries(Object.entries(native.keyboards.firstByKey).map(([key, names]) =>
    [key, names.map(name => name.replace(/^zero-/, 'Ø'))]));
  const rhymes = {}, rhymeTonesByKey = {};
  const toneDigits = {'一': '1', '二': '2', '三': '3', '四': '4', '轻': '0'};
  for (const [key, names] of Object.entries(native.keyboards.secondByKey)) {
    const grouped = new Map();
    for (const name of names) {
      const [rhyme, tone] = name.split('·');
      if (!grouped.has(rhyme)) grouped.set(rhyme, new Set());
      grouped.get(rhyme).add(toneDigits[tone]);
    }
    rhymes[key] = [...grouped.keys()];
    rhymeTonesByKey[key] = Object.fromEntries([...grouped].map(([name, tones]) =>
      [name, [...tones].sort().join('')]));
  }
  // The ordinary renderer uses toneKeysByTone only as an auxiliary boundary
  // adapter. Its independent tone labels are replaced with shape-only labels.
  const displayName = native.name.startsWith(native.id + ' · ') ? native.name.slice(native.id.length + 3) : native.name;
  return {id: native.id, name: displayName, roles, rhymes,
    tone: native.contract.toneKeysByTone, rhymeTonesByKey};
}

function snowFilteredRows(native, query, kind = 'all', pinyin = null) {
  const q = snowNormalizeQuery(query);
  const parsed = q ? snowParsedQuery(native, pinyin, query) : null;
  const hanzi = SNOW_QUERY.isHanzi(query);
  return (native.filterRows || []).filter(row => {
    if (kind !== 'all' && row[5] !== kind) return false;
    if (!q) return true;
    if (hanzi) return row[0] === String(query).trim();
    if (parsed) return SNOW_QUERY.matchesReading(parsed, row[1]);
    return row[2].toLowerCase().includes(q) || row[3].toLowerCase().includes(q);
  });
}

function snowParsedQuery(native, pinyin, query) {
  const inventory = pinyin || [...new Set((native.filterRows || []).flatMap(row =>
    SNOW_QUERY.readingTokens(row[1]).map(token => token.syllable)))];
  return SNOW_QUERY.parsePinyin(inventory, query, (py, tone) => pinyin && native.tonedCodes ? native.tonedCodes[py]?.[tone - 1] : ' ');
}

function snowQueryKeys(native, data, query, rows = []) {
  const parsed = snowParsedQuery(native, data.pinyin, query);
  if (parsed) return parsed.keys;
  if (SNOW_QUERY.isHanzi(query)) return SNOW_QUERY.hanziKeys(query, data.characters || [],
    (py, tone) => native.tonedCodes[py]?.[tone - 1], rows.filter(row => row[0] === query.trim()));
  // Explicit encoded-path searches may intentionally contain auxiliary keys.
  return new Set(rows.flatMap(row => [...row[3]]));
}

function snowRowsLoad(rows, mainOnly = false) {
  const tracks = {};
  for (const row of rows) {
    const track = tracks[row[5]] ||= {load: {}, strokes: 0};
    for (const key of row[mainOnly ? 2 : 3]) {
      track.load[key] = (track.load[key] || 0) + row[4];
      track.strokes += row[4];
    }
  }
  const load = {};
  let denominator = 0;
  for (const [kind, track] of Object.entries(tracks)) {
    if (!track.strokes) continue;
    const weight = SNOW_TONED_TRACK_WEIGHTS[kind];
    denominator += weight;
    for (const [key, value] of Object.entries(track.load)) load[key] = (load[key] || 0) + weight * value / track.strokes;
  }
  for (const key of Object.keys(load)) load[key] /= denominator;
  return load;
}

// Preview arbitrary full pinyin even when the frozen word corpus lacks it.
// Prefer the fewest syllables; union equally short readings and legal tones.
// This keeps jian4dao1 from also activating ji + an4 + da + o1.
function snowPinyinPreview(native, pinyin, query) {
  const result = snowParsedQuery(native, pinyin, query);
  return result ? [{keys: [...result.keys]}] : [];
}

if (typeof module !== 'undefined') module.exports = {
  SNOW_TONED_TRACK_WEIGHTS, SNOW_RHYME_COLORS, SNOW_TONE_FILLS,
  snowNormalizeQuery, snowKeyboardEntry, snowFilteredRows, snowRowsLoad, snowPinyinPreview, snowQueryKeys,
};
