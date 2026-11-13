import test from 'node:test';
import assert from 'node:assert/strict';
import experiment from '../tools/explore_toned_2126.js';
import semantics from '../tools/auxiliary_semantics.js';
import model from '../tools/ckt_v4_model.js';
import frontier from '../tools/frontier_toned_2126.js';
import toneProbe from '../tools/probe_tone_regions_2126.js';
import fastScorer from '../tools/fast_toned_2126.js';
import qempty from '../tools/explore_qempty_2126.js';

test('Q-empty search keeps exactly 9/9/7 and exhausts the legal neighborhood', () => {
  const maps = [[1, 2, 3, 4, 5, 6, 7, 8, 9, 1],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 0], [0, 1, 2, 3, 4, 5, 6, 0, 1, 2]];
  assert.ok(qempty.valid(maps));
  const next = qempty.constrainedNeighbors(maps);
  assert.ok(next.length > 0);
  assert.ok(next.every(n => qempty.valid(n.maps)));
  assert.deepEqual(next, frontier.neighbors(maps, false).filter(n => qempty.valid(n.maps)));
  const withQ = maps.map(row => [...row]); withQ[0][9] = 0;
  assert.equal(qempty.valid(withQ), false);
  const seeds = qempty.seeds(withQ);
  assert.equal(seeds.length, 9);
  assert.ok(seeds.every(qempty.valid));
  const extraVacancy = maps.map(row => [...row]); extraVacancy[0][1] = 1;
  assert.equal(qempty.valid(extraVacancy), false);
  assert.equal(JSON.stringify(maps[0]), '[1,2,3,4,5,6,7,8,9,1]');
});

test('prepared scorer preserves early winners and balanced terminal ranks across word lengths', () => {
  const tokenKeys = ['ba1'];
  const layout = {id: 'synthetic', shapeKeysByMeaning: 'AEUIO', tonedCodes: ['BZ']};
  const shape = {'甲': 'AA', '乙': 'AA', '丙': 'AA', '丁': 'AA'};
  const data = {pinyin: ['ba'], base: [[0]], shapes: {snowshape: shape},
    characters: [['甲', 0, 1, 9, true], ['乙', 0, 1, 8, true]]};
  const words = Object.fromEntries([2, 3, 4].map(n => [`word${n}`,
    Array.from({length: 9}, (_, i) => ({text: '甲'.repeat(n - 1) + ['甲', '乙', '丙', '丁'][i % 4],
      py: Array(n).fill(0), tones: Array(n).fill(1), weight: 100 - i}))]));
  const motor = code => ({upperMs: code.length * 13});
  const summarize = outcomes => {
    const totalWeight = outcomes.reduce((s, r) => s + r.weight, 0);
    const weighted = f => outcomes.reduce((s, r) => s + r.weight * f(r), 0) / totalWeight;
    const track = {count: outcomes.length, totalWeight, motorUpperMs: weighted(r => r.motorUpperMs),
      firstAuxRate: weighted(r => Number(r.auxCount >= 1)), secondAuxRate: weighted(r => Number(r.auxCount >= 2)),
      thirdAuxRate: 0, selectionRate: weighted(r => Number(r.rank > 1)),
      meanRejectedCandidates: weighted(r => r.rank - 1), meanPageActions: weighted(r => Math.floor((r.rank - 1) / 6)),
      meanKeys: weighted(r => r.codeLength)};
    track.effectiveMs = track.motorUpperMs + 300 * (track.firstAuxRate + track.secondAuxRate) +
      600 * track.selectionRate + 50 * track.meanRejectedCandidates + 300 * track.meanPageActions;
    return track;
  };
  const context = {data, words, motor, reference: {summarize,
    tracks: Object.fromEntries(['character', 'word2', 'word3', 'word4'].map(k => [k, {effectiveMs: 100}]))},
    buildRowsForOrder(entry, data, words, mode, tone, kind) {
      return words[kind].map((item, i) => {
        const n = Number(kind.slice(-1)), codes = item.py.map(py => entry.codeList[py]);
        const stem = codes.map(code => code[0]).join('');
        const base = n === 2 ? codes.join('') : n === 3 ? stem + codes[2][1] : stem;
        return {id: `${kind === 'word2' ? 'w2' : kind}:${i}`, text: item.text, kind, weight: item.weight, baseLength: 4,
          stages: model.makeStages('four-code-top', kind,
            [...(n === 3 ? [stem] : []), base, base + 'A', base + 'AA'].map(code => ({length: code.length, codes: [code]})))};
      });
    }};
  const actual = fastScorer.prepare(tokenKeys, context)(layout);
  const expected = experiment.evaluate(layout, tokenKeys, context);
  for (const kind of Object.keys(expected.tracks)) for (const field of Object.keys(expected.tracks[kind])) {
    assert.ok(Math.abs(actual.tracks[kind][field] - expected.tracks[kind][field]) < 1e-10, `${kind}/${field}`);
  }
  assert.ok(actual.tracks.word2.meanPageActions > 0);
});

test('36 tone assignments exhaust paired tones and row placements with neutral following tone 1', () => {
  const assignments = toneProbe.assignments();
  assert.equal(assignments.length, 36);
  assert.equal(new Set(assignments.map(row => JSON.stringify(row))).size, 36);
  for (const row of assignments) {
    assert.equal(row[5], row[1]);
    assert.deepEqual([0, 1, 2].map(r => [1, 2, 3, 4].filter(t => row[t] === r).length).sort(), [1, 1, 2]);
  }
});

test('frontier neighborhood contains every legal single move and swap exactly once', () => {
  const maps = experiment.ROWS.map(keys => Array.from({length: 10}, (_, i) => i % keys.length));
  const original = JSON.stringify(maps);
  const strict = frontier.neighbors(maps);
  const relaxed = frontier.neighbors(maps, false);
  assert.equal(JSON.stringify(maps), original);
  assert.equal(new Set(strict.map(row => JSON.stringify(row.maps))).size, strict.length);
  assert.ok(relaxed.length > strict.length);
  const signatures = new Set(strict.map(row => JSON.stringify(row.maps)));
  for (const row of relaxed) {
    const valid = row.maps.every((map, r) => new Set(map).size === experiment.ROWS[r].length);
    assert.equal(signatures.has(JSON.stringify(row.maps)), valid);
    const differences = row.maps.flatMap((map, r) => map.filter((key, i) => key !== maps[r][i]));
    assert.ok(differences.length === 1 || differences.length === 2);
  }
  assert.ok(strict.some(row => row.move.kind === 'reassign'));
  assert.ok(strict.some(row => row.move.kind === 'swap'));
});

test('21x26 auxiliary policies enumerate 144 distinct native two-auxiliary routes', () => {
  const policies = experiment.auxiliaryPolicies();
  assert.equal(new Set(policies.map(policy => JSON.stringify(policy))).size, 144);
  for (const policy of policies) for (const [kind, order] of Object.entries(policy)) {
    assert.equal(order.length, 2);
    assert.notEqual(order[0], order[1]);
    assert.ok([...order].every(position => Number(position) >= 1 && Number(position) <= Number(kind.slice(-1))));
  }
  assert.ok(policies.some(policy => JSON.stringify(policy) === JSON.stringify(experiment.POLICY)));
});

test('21x26 tone regions include all second keys and normalize neutral tone', () => {
  assert.equal(new Set(experiment.ROWS.join('')).size, 26);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(experiment.toneRow), [2, 2, 1, 1, 0, 2]);
  assert.throws(() => experiment.toneRow(6), /invalid tone/);
  experiment.validateLayout({tonedCodes: ['BA', 'BQ', 'BZ']}, ['ba2', 'ba4', 'ba5']);
  assert.throws(() => experiment.validateLayout({tonedCodes: ['AA']}, ['a2']), /invalid 21x26/);
  assert.throws(() => experiment.validateLayout({tonedCodes: ['BZ']}, ['ba4']), /wrong tone region/);
});

test('native word adapter preserves tone distinctions, weights and order without mutation', () => {
  const layout = {tonedCodes: ['BQ', 'BA', 'BZ']};
  const tokens = ['ba4', 'ba2', 'ba5'];
  const words = {word2: [{text: '爸爸', py: [0, 0], tones: [4, 0], weight: 27}]};
  const before = JSON.stringify(words);
  const adapted = experiment.adaptWords(layout, tokens, {pinyin: ['ba']}, words);
  assert.deepEqual(adapted.word2[0].py, [0, 2]);
  assert.equal(adapted.word2[0].weight, 27);
  assert.equal(JSON.stringify(words), before);
  assert.throws(() => experiment.adaptWords(layout, [], {pinyin: ['ba']}, words), /uncovered word token/);
});

test('AEUIO shape meanings round-trip through IEUAO tone slots', () => {
  const toneKeysByTone = semantics.toneKeysFromShapeKeys('AEUIO');
  assert.equal(toneKeysByTone, 'IEUAO');
  assert.equal(semantics.shapeKeysFromToneKeys(toneKeysByTone), 'AEUIO');
  assert.equal(semantics.toneDigitsAtShapeKeys(toneKeysByTone), '42310');
  assert.equal(semantics.physicalShape('AEUIO', toneKeysByTone), 'AEUIO');
});

test('21x26 residual three-character words join the two/four-character pools', () => {
  const stages = model.makeStages('four-code-top', 'word3', ['BCD', 'BCDA', 'BCDAE', 'BCDAEU']
    .map(code => ({length: code.length, codes: [code]})));
  assert.deepEqual(stages.map(stage => stage.pool), ['word3:three', 'word:four', 'word:five', 'word:six']);
  const row = (id, kind, weight, stages) => ({id, text: id, kind, weight, baseLength: 4, stages});
  const outcomes = model.resolveCompetition([
    row('early', 'word3', 100, stages), row('residual', 'word3', 10, stages),
    row('pair', 'word2', 50, model.makeStages('four-code-top', 'word2',
      ['BCDA', 'BCDAO', 'BCDAOI'].map(code => ({length: code.length, codes: [code]})))),
  ], {lengthBalance: experiment.BALANCE});
  assert.equal(outcomes.find(row => row.id === 'early').code, 'BCD');
  assert.equal(outcomes.find(row => row.id === 'pair').code, 'BCDA');
  assert.equal(outcomes.find(row => row.id === 'residual').code, 'BCDAE');
});
