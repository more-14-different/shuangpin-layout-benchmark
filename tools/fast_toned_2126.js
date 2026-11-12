'use strict';

// Prepared single-code rows; same tie-break, pools and soft balance as the JS oracle.
const model = require('./ckt_v4_model.js');
const scorer = require('./score_completion_ckt_v4.js');
const toned = require('./score_toned_2121_ckt_v51.js');
const {physicalShape, toneKeysFromShapeKeys} = require('./auxiliary_semantics.js');
const {BALANCE, POLICY} = require('./explore_toned_2126.js');

function prepare(tokenKeys, context, shapeKeysByMeaning = 'AEUIO') {
  const {data, words, reference, motor} = context;
  const toneKeysByTone = toneKeysFromShapeKeys(shapeKeysByMeaning);
  const indices = new Map(tokenKeys.map((token, i) => [token, i]));
  const common = new Set(data.base.map(([index]) => index));
  const records = [];
  const get = (py, tone) => {
    const index = indices.get(`${data.pinyin[py]}${tone === 0 ? 5 : tone}`);
    if (index === undefined) throw new Error('missing token in prepared evaluator');
    return index;
  };
  for (const [text, py, tone, weight, isCommon] of data.characters) {
    if (!isCommon || !(weight > 0) || scorer.FIXED_ONE_KEY.has(text) || !common.has(py)) continue;
    const aux = physicalShape(data.shapes.snowshape[text], toneKeysByTone);
    if (aux.length < 2) continue;
    records.push({id: `c:${text}:${py}`, text, kind: 'character', weight, py: [get(py, tone)], aux});
  }
  for (const kind of ['word2', 'word3', 'word4']) words[kind].forEach((item, i) => {
    const aux = [...item.text].map(ch => physicalShape(data.shapes.snowshape[ch], toneKeysByTone)[0]);
    records.push({id: `${kind === 'word2' ? 'w2' : kind}:${i}`, text: item.text, kind,
      weight: item.weight, py: item.py.map((py, at) => get(py, item.tones[at])), aux});
  });
  const ordered = [...records].sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const kinds = ['character', 'word2', 'word3', 'word4'];
  const fields = ['motorUpperMs', 'firstAuxRate', 'secondAuxRate', 'thirdAuxRate', 'selectionRate',
    'meanRejectedCandidates', 'meanPageActions', 'meanKeys'];
  return (layout, policy = POLICY) => {
    if (layout.shapeKeysByMeaning !== shapeKeysByMeaning) throw new Error('prepared shape mapping mismatch');
    const pools = Array.from({length: 7}, () => new Map());
    const states = [];
    const tracks = Object.fromEntries(kinds.map(kind => [kind,
      {count: 0, totalWeight: 0, ...Object.fromEntries(fields.map(field => [field, 0]))}]));
    function add(state) {
      const code = state.codes[state.stage];
      const key = (state.row.kind === 'character' ? 'c' : 'w') + code;
      const pool = pools[code.length];
      if (!pool.has(key)) pool.set(key, []);
      pool.get(key).push(state);
    }
    for (const row of ordered) {
      const codes = row.py.map(index => layout.tonedCodes[index]);
      let stages;
      if (row.kind === 'character') stages = [codes[0], codes[0] + row.aux[0], codes[0] + row.aux.slice(0, 2)];
      else {
        const order = policy[row.kind];
        const a = row.aux[Number(order[0]) - 1], b = row.aux[Number(order[1]) - 1];
        if (!a || !b) continue;
        const stem = codes.map(code => code[0]).join('');
        const base = row.kind === 'word2' ? codes.join('') : row.kind === 'word3' ? stem + codes[2][1] : stem;
        stages = [...(row.kind === 'word3' ? [stem] : []), base, base + a, base + a + b];
      }
      const state = {row, text: row.text, codes: stages, stage: 0, order: states.length};
      states.push(state); add(state);
    }
    for (let length = 2; length <= 6; length++) {
      for (const bucket of pools[length].values()) {
        // Later pools receive survivors from distinct prior buckets; restore global order.
        bucket.sort((a, b) => a.order - b.order);
        const ranked = length >= 4 && bucket.length > 1
          ? model.lengthBalanceRows(bucket, BALANCE) : bucket;
        for (let at = 0; at < ranked.length; at++) {
          const state = ranked[at];
          if (at > 0 && state.stage < state.codes.length - 1) { state.stage++; add(state); continue; }
          const row = state.row, track = tracks[row.kind], weight = row.weight;
          const auxCount = Math.max(0, length - (row.kind === 'character' ? 2 : 4));
          track.count++; track.totalWeight += weight;
          track.motorUpperMs += weight * motor(state.codes[state.stage]).upperMs;
          track.firstAuxRate += weight * (auxCount >= 1);
          track.secondAuxRate += weight * (auxCount >= 2);
          track.selectionRate += weight * (at > 0);
          track.meanRejectedCandidates += weight * at;
          track.meanPageActions += weight * Math.floor(at / 6);
          track.meanKeys += weight * length;
        }
      }
      pools[length].clear();
    }
    for (const track of Object.values(tracks)) {
      for (const field of fields) track[field] /= track.totalWeight;
      track.effectiveMs = track.motorUpperMs + 300 * track.firstAuxRate + 300 * track.secondAuxRate +
        600 * track.selectionRate + 50 * track.meanRejectedCandidates + 300 * track.meanPageActions;
    }
    return {id: layout.id, policy, tracks, score: toned.normalizedScore(tracks, reference.tracks)};
  };
}

module.exports = {prepare};
