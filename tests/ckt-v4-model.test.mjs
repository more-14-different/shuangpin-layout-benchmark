import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {
  classifyContract,
  DEFAULT_COGNITIVE_PRIOR,
  makeStages,
  lengthBalanceRows,
  resolveCompetition,
  cognitiveCost,
  compositeScore,
  upstreamMotor,
  projectedMotor,
} = require('../tools/ckt_v4_model.js');
const {installFrontend, score: scoreV4} = require('../tools/integrate_completion_ckt_v4.js');

const motorCost = code => ({upperMs: [...code].length * 100});

function row(id, kind, weight, baseLength, contract, stages) {
  return {id, text: id, kind, weight, baseLength, stages: makeStages(contract, kind, stages)};
}

test('capacity classification is exact, not based on a vague key-count threshold', () => {
  assert.equal(classifyContract([21, 21]), 'traditional-21x21');
  assert.equal(classifyContract([21, 26]), 'four-code-top');
  assert.equal(classifyContract([25, 30]), 'four-code-top');
  assert.equal(classifyContract([29, 34]), 'four-code-top');
});

test('soft length balance mirrors deployed page fill and preserves the original first candidate', () => {
  const rows = [
    ['九霄', 'word2'], ['风萧萧', 'word3'], ['非学校', 'word3'],
    ['就小', 'word2'], ['旧校', 'word2'], ['发儿小', 'word3'],
    ['分学校', 'word3'], ['方案选单', 'word4'], ['分享心得', 'word4'],
  ].map(([text, kind], index) => ({id: String(index), text, kind}));
  const balanced = lengthBalanceRows(rows, {pageSize: 6, maximumCandidates: 120});
  assert.deepEqual(balanced.slice(0, 6).map(value => value.text), [
    '九霄', '风萧萧', '非学校', '就小', '方案选单', '分享心得',
  ]);
  assert.equal(balanced[0], rows[0]);
});

test('soft length balance changes terminal ranks without changing an early-commit winner', () => {
  const c = 'four-code-top';
  const rows = [
    row('二甲', 'word2', 100, 4, c, [
      {length: 4, codes: ['ABCD']}, {length: 5, codes: ['ABCDI']}, {length: 6, codes: ['ABCDIE']},
    ]),
    row('二乙', 'word2', 90, 4, c, [
      {length: 4, codes: ['ABCD']}, {length: 5, codes: ['ABCDI']}, {length: 6, codes: ['ABCDIE']},
    ]),
    row('二丙', 'word2', 80, 4, c, [
      {length: 4, codes: ['ABCD']}, {length: 5, codes: ['ABCDI']}, {length: 6, codes: ['ABCDIE']},
    ]),
    row('二丁', 'word2', 79, 4, c, [
      {length: 4, codes: ['ABCD']}, {length: 5, codes: ['ABCDI']}, {length: 6, codes: ['ABCDIE']},
    ]),
    row('二戊', 'word2', 78, 4, c, [
      {length: 4, codes: ['ABCD']}, {length: 5, codes: ['ABCDI']}, {length: 6, codes: ['ABCDIE']},
    ]),
    row('三甲甲', 'word3', 70, 4, c, [
      {length: 3, codes: ['AAA']}, {length: 4, codes: ['ABCD']}, {length: 5, codes: ['ABCDI']}, {length: 6, codes: ['ABCDIE']},
    ]),
    row('四甲甲甲', 'word4', 60, 4, c, [
      {length: 4, codes: ['ABCD']}, {length: 5, codes: ['ABCDI']}, {length: 6, codes: ['ABCDIE']},
    ]),
  ];
  const plain = resolveCompetition(rows, {motorCost});
  const balanced = resolveCompetition(rows, {
    motorCost,
    lengthBalance: {pageSize: 3, maximumCandidates: 120, minimumInputLength: 4},
  });
  assert.equal(plain.find(value => value.text === '二甲').codeLength, 4);
  assert.equal(balanced.find(value => value.text === '二甲').codeLength, 4);
  assert.equal(plain.find(value => value.text === '四甲甲甲').rank, 4);
  assert.equal(balanced.find(value => value.text === '四甲甲甲').rank, 3);
});

test('21x21 joins two- and four-character words at four keys', () => {
  const c = 'traditional-21x21';
  const rows = [
    row('w2-heavy', 'word2', 10, 4, c, [
      {length: 4, codes: ['ABCD']}, {length: 5, codes: ['ABCDI']}, {length: 6, codes: ['ABCDIE']},
    ]),
    row('w4-light', 'word4', 1, 4, c, [
      {length: 4, codes: ['ABCD']}, {length: 5, codes: ['ABCDE']}, {length: 6, codes: ['ABCDEI']},
    ]),
  ];
  const out = resolveCompetition(rows, {motorCost});
  assert.equal(out[0].codeLength, 4);
  assert.equal(out[1].codeLength, 5);
  assert.equal(out[1].auxCount, 1);
});

test('21x21 AAAB three-character route is isolated from the AUAU/AAAA four-key pool', () => {
  const c = 'traditional-21x21';
  const rows = [
    row('w3', 'word3', 1, 3, c, [
      {length: 3, codes: ['AAA']}, {length: 4, codes: ['ABCD']}, {length: 5, codes: ['ABCDI']},
    ]),
    row('w2', 'word2', 10, 4, c, [
      {length: 4, codes: ['ABCD']}, {length: 5, codes: ['ABCDI']}, {length: 6, codes: ['ABCDIE']},
    ]),
    row('w3-blocker', 'word3', 20, 3, c, [
      {length: 3, codes: ['AAA']}, {length: 4, codes: ['WXYZ']}, {length: 5, codes: ['WXYZI']},
    ]),
  ];
  const out = resolveCompetition(rows, {motorCost});
  assert.equal(out.find(x => x.id === 'w3').codeLength, 4);
  assert.equal(out.find(x => x.id === 'w2').codeLength, 4);
});

test('non-21x21 AAAU residual joins word2 and word4 at four keys', () => {
  const c = 'four-code-top';
  const rows = [
    row('w3-heavy', 'word3', 20, 4, c, [
      {length: 3, codes: ['AAA']}, {length: 4, codes: ['ABCD']}, {length: 5, codes: ['ABCDI']}, {length: 6, codes: ['ABCDIE']},
    ]),
    row('w3-residual', 'word3', 2, 4, c, [
      {length: 3, codes: ['AAA']}, {length: 4, codes: ['WXYZ']}, {length: 5, codes: ['WXYZI']}, {length: 6, codes: ['WXYZIE']},
    ]),
    row('w2', 'word2', 10, 4, c, [
      {length: 4, codes: ['WXYZ']}, {length: 5, codes: ['WXYZE']}, {length: 6, codes: ['WXYZEA']},
    ]),
    row('w4', 'word4', 1, 4, c, [
      {length: 4, codes: ['WXYZ']}, {length: 5, codes: ['WXYZO']}, {length: 6, codes: ['WXYZOU']},
    ]),
  ];
  const out = resolveCompetition(rows, {motorCost});
  assert.equal(out.find(x => x.id === 'w3-heavy').codeLength, 3);
  assert.equal(out.find(x => x.id === 'w3-heavy').auxCount, 0);
  assert.equal(out.find(x => x.id === 'w2').codeLength, 4);
  assert.equal(out.find(x => x.id === 'w3-residual').codeLength, 5);
  assert.equal(out.find(x => x.id === 'w3-residual').auxCount, 1, 'AAAU is routing, only the fifth B is an auxiliary key');
  assert.equal(out.find(x => x.id === 'w4').codeLength, 5);
});

test('terminal rank is preserved and cognitive selection is rank-aware', () => {
  const c = 'traditional-21x21';
  const rows = [4, 3, 2, 1].map(weight => row(`w${weight}`, 'word2', weight, 4, c, [
    {length: 4, codes: ['ABCD']}, {length: 5, codes: ['ABCDI']}, {length: 6, codes: ['ABCDIE']},
  ]));
  const out = resolveCompetition(rows, {motorCost});
  const last = out.find(x => x.id === 'w1');
  assert.equal(last.rank, 2, 'the stage-5 loser competes with the remaining stage-5 winner only');
  assert.deepEqual(cognitiveCost(last, {
    firstAuxMs: 100, secondAuxMs: 200, selectionDecisionMs: 300,
    scanPerCandidateMs: 50, selectionActionMs: 20, pageSize: 9, pageActionMs: 0,
  }), {firstAuxMs: 100, secondAuxMs: 200, selectionMs: 370, totalMs: 670});
});

test('default selection cognition grows at every rank and jumps at a page boundary', () => {
  const outcome = rank => ({rank, auxCount: 0});
  assert.deepEqual(DEFAULT_COGNITIVE_PRIOR, {
    firstAuxMs: 300, secondAuxMs: 300, selectionDecisionMs: 600,
    scanPerCandidateMs: 50, selectionActionMs: 0, pageSize: 9, pageActionMs: 300,
  });
  assert.equal(cognitiveCost(outcome(1)).selectionMs, 0);
  assert.equal(cognitiveCost(outcome(2)).selectionMs, 650);
  assert.equal(cognitiveCost(outcome(9)).selectionMs, 1000);
  assert.equal(cognitiveCost(outcome(10)).selectionMs, 1350);
  assert.equal(cognitiveCost(outcome(11)).selectionMs, 1400);
});

test('fourth-power S005 normalization remains anchored at ten', () => {
  const tracks = {keytao: {}, sanpin: {}};
  for (const mode of Object.keys(tracks)) {
    for (const kind of ['character', 'word2', 'word3', 'word4']) tracks[mode][kind] = {effectiveMs: 123};
  }
  assert.equal(compositeScore(tracks, tracks), 10);
});

test('upstream continuation is exact through four keys and labelled extrapolated for five/six', () => {
  function table(length, value) {
    const values = new Float32Array(2 ** length).fill(value);
    return {base64: Buffer.from(values.buffer).toString('base64')};
  }
  const snapshot = {
    keys: 'AB', commit: 'test', roles: ['L2i1', 'L3i1', 'L3i2', 'L4i1', 'L4i2', 'L4i3'],
    tables: {L2i1: table(2, 2), L3i1: table(3, 3), L3i2: table(3, 5),
      L4i1: table(3, 7), L4i2: table(4, 11), L4i3: table(3, 13)},
  };
  const cost = upstreamMotor(snapshot, {continuationGuardMs: 17});
  assert.deepEqual(cost('AB'), {upperMs: 2, exact: true, codeLength: 2, upstreamCommit: 'test'});
  assert.equal(cost('ABA').upperMs, 8);
  assert.deepEqual(cost('ABAB'), {upperMs: 31, exact: true, codeLength: 4, upstreamCommit: 'test'});
  assert.deepEqual(cost('ABABA'), {upperMs: 59, exact: false, codeLength: 5, upstreamCommit: 'test'});
});

test('all declared extension keys remain usable in any code position', () => {
  const native = code => ({upperMs: [...code].reduce((sum, key) => sum + (key === 'A' ? 1 : 2), 0), exact: true});
  const motor = projectedMotor(native, 'AB', {
    '[': {donors: {A: 0.75, B: 0.25}, distance_guard_multiplier: 1},
    ']': {donors: {A: 0.5, B: 0.5}, distance_guard_multiplier: 2},
    '\\': {donors: {B: 1}, distance_guard_multiplier: 3},
    "'": {donors: {A: 1}, distance_guard_multiplier: 1},
  });
  for (const code of ["[ABB", "A]BB", "AB\\B", "ABA'", "[]\\'"]) {
    const value = motor(code);
    assert.ok(Number.isFinite(value.upperMs) && value.upperMs > 0, code);
    assert.equal(value.projected, true);
    assert.equal(value.exact, false);
  }
});

test('HTML integration installs the v4 column once and remains idempotent', () => {
  const old = `UG.bCompositeV2={};
function bCompletionScoreV2(x){}
const headers=[{label:'综合补全 CKT v3 · 四阶词长 · 原生五键 · ×10',help:'bCompositeV3'},];
const row=(foo)),scoreTau=bCompletionScore(m,tau);
const base=[v2Score,v3Score,scoreTau];
const cells=[num(v2Score,5),num(v3Score,5),num(scoreTau,5),];`;
  const installed = installFrontend(old);
  assert.match(installed, /UG\.bCompositeV4=/);
  assert.match(installed, /function bCompletionScoreV4/);
  assert.match(installed, /help:'bCompositeV4'/);
  assert.match(installed, /v4Score=bCompletionScoreV4/);
  assert.equal(installFrontend(installed), installed);
});

test('realtime v4 formula keeps S005 at ten for every slider setting', () => {
  const modes = {keytao: {}, sanpin: {}};
  for (const mode of Object.keys(modes)) {
    for (const kind of ['character', 'word2', 'word3', 'word4']) {
      modes[mode][kind] = {motorUpperMs: 100, firstAuxRate: 0.2, secondAuxRate: 0.1, selectionRate: 0.05};
    }
  }
  for (const parameters of [
    {firstAuxMs: 300, secondAuxMs: 300, selectionDecisionMs: 600},
    {firstAuxMs: 0, secondAuxMs: 0, selectionDecisionMs: 0},
    {firstAuxMs: 1000, secondAuxMs: 1000, selectionDecisionMs: 2000},
  ]) assert.equal(scoreV4(modes, modes, parameters), 10);
});
