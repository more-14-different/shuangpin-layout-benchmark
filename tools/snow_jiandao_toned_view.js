'use strict';

// Shared by the offline atlas and Node tests. Tone 5 is internal; the UI uses 0.
const SNOW_TONED_TRACK_WEIGHTS = Object.freeze({character: 1, word2: 3, word3: 1, word4: 1});
const SNOW_RHYME_COLORS = Object.freeze({
  'a-ou': '#a84944', 'en-n': '#78602a', 'e-ei': '#556d9b',
  'eng-ai-v': '#825699', an: '#397f69', ang: '#ad632d',
  u: '#438098', 'i-er': '#a54f7a', 'o-ong': '#778132', ao: '#6853a0',
});
const SNOW_TONE_FILLS = Object.freeze({'4': '#d8e9f3', '23': '#dcefdc', '01': '#f5e8bd'});

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
  return {id: native.id, name: native.name, roles, rhymes,
    tone: native.contract.toneKeysByTone, rhymeTonesByKey};
}

function snowFilteredRows(native, query, kind = 'all') {
  const q = snowNormalizeQuery(query);
  return (native.filterRows || []).filter(row => {
    if (kind !== 'all' && row[5] !== kind) return false;
    if (!q) return true;
    // Digits stay attached to their syllables. Mixed queries such as jian4dao
    // match either tone of dao without allowing jian1 to match jian4.
    if (/^[a-zv0-4]+$/.test(q)) {
      const tokens = snowNormalizeQuery(row[1]).match(/[a-zv]+[0-4]/g) || [];
      for (let start = 0; start < tokens.length; start++) {
        let at = 0;
        for (const token of tokens.slice(start)) {
          const syllable = token.slice(0, -1), tone = token.slice(-1);
          if (!q.startsWith(syllable, at)) break;
          at += syllable.length;
          if (/[0-4]/.test(q[at] || '!')) {
            if (q[at] !== tone) break;
            at++;
          }
          if (at === q.length) return true;
        }
      }
    }
    return row[0].includes(q) || row[2].toLowerCase().includes(q) || row[3].toLowerCase().includes(q);
  });
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
  const q = snowNormalizeQuery(query);
  if (!/^[a-zv0-4]+$/.test(q)) return [];
  const memo = new Map();
  function visit(at) {
    if (at === q.length) return {keys: new Set(), count: 0};
    if (memo.has(at)) return memo.get(at);
    const keys = new Set();
    let legal = false;
    let count = Infinity;
    for (let i = 0; i < pinyin.length; i++) {
      const syllable = pinyin[i];
      if (!q.startsWith(syllable, at)) continue;
      let end = at + syllable.length, tones = [1, 2, 3, 4, 5];
      if (/[0-4]/.test(q[end] || '!')) {tones = [Number(q[end]) || 5];end++}
      const tail = visit(end);
      if (!tail) continue;
      for (const tone of tones) {
        const code = native.tonedCodes[i]?.[tone - 1];
        if (!code || tail.count + 1 > count) continue;
        if (tail.count + 1 < count) {keys.clear();count = tail.count + 1}
        legal = true;for (const key of code) keys.add(key);for (const key of tail.keys) keys.add(key);
      }
    }
    // Union keys at each suffix: long toneless queries stay linear in length
    // rather than expanding every combination of readings and tone variants.
    const result = legal ? {keys, count} : null;
    memo.set(at, result);
    return result;
  }
  const result = visit(0);
  return result ? [{keys: [...result.keys]}] : [];
}

if (typeof module !== 'undefined') module.exports = {
  SNOW_TONED_TRACK_WEIGHTS, SNOW_RHYME_COLORS, SNOW_TONE_FILLS,
  snowNormalizeQuery, snowKeyboardEntry, snowFilteredRows, snowRowsLoad, snowPinyinPreview,
};
