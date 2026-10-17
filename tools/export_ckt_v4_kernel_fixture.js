#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {makeStages, resolveCompetition, summarizeOutcomes} = require('./ckt_v4_model.js');

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ[]\\;',./";
const PARAMETERS = {
  firstAuxMs: 100,
  secondAuxMs: 200,
  selectionDecisionMs: 300,
  scanPerCandidateMs: 50,
  selectionActionMs: 20,
  pageSize: 9,
  pageActionMs: 40,
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return args;
}

function row(id, kind, weight, baseLength, contract, codes) {
  const stages = makeStages(contract, kind, codes.map(code => ({length: [...code].length, codes: [code]})));
  return {id, text: id, kind, weight, baseLength, stages};
}

function traditionalRows() {
  const c = 'traditional-21x21';
  return [
    row('c-heavy', 'character', 10, 2, c, ['AB', 'ABI', 'ABIE']),
    row('c-light', 'character', 2, 2, c, ['AB', 'ABO', 'ABOE']),
    row('w2-heavy', 'word2', 10, 4, c, ['ABCD', 'ABCDI', 'ABCDIE']),
    row('w4-light', 'word4', 2, 4, c, ['ABCD', 'ABCDE', 'ABCDEI']),
    ...Array.from({length: 12}, (_, index) => row(
      `terminal-${index + 1}`,
      index % 2 ? 'word2' : 'word4',
      12 - index,
      4,
      c,
      ['WXYZ', 'WXYZI', 'WXYZIE'],
    )),
    row('w3-heavy', 'word3', 9, 3, c, ['AAA', 'AAAI', 'AAAIE']),
    row('w3-light', 'word3', 1, 3, c, ['AAA', 'AAAO', 'AAAOE']),
  ];
}

function fourCodeTopRows() {
  const c = 'four-code-top';
  return [
    row('c-heavy', 'character', 8, 2, c, ['ZA', 'ZAI', 'ZAIE']),
    row('c-light', 'character', 2, 2, c, ['ZA', 'ZAO', 'ZAOE']),
    row('w3-early', 'word3', 20, 4, c, ['AAA', 'ABCD', 'ABCDI', 'ABCDIE']),
    row('w3-residual', 'word3', 2, 4, c, ['AAA', 'WXYZ', 'WXYZI', 'WXYZIE']),
    row('w2-heavy', 'word2', 10, 4, c, ['WXYZ', 'WXYZE', 'WXYZEA']),
    row('w4-light', 'word4', 1, 4, c, ['WXYZ', 'WXYZO', 'WXYZOU']),
    row('w2-extension', 'word2', 5, 4, c, ["AB[,", "AB[,I", "AB[,IE"]),
    row('w4-extension', 'word4', 1, 4, c, ["AB[,", "AB[,O", "AB[,OU"]),
  ];
}

function serializeRow(source) {
  return {
    id: source.id,
    text: source.text,
    kind: source.kind,
    weight: source.weight,
    baseLength: source.baseLength,
    stages: source.stages.map(stage => ({order: stage.order, pool: stage.pool, codes: stage.codes})),
  };
}

function makeCase(name, contract, rows) {
  const outcomes = resolveCompetition(rows, {motorCost: code => ({upperMs: [...code].length * 100})});
  return {
    name,
    contract,
    rows: rows.map(serializeRow),
    expected: {
      outcomes: outcomes.map(value => ({
        id: value.id,
        code: value.code,
        codeLength: value.codeLength,
        auxCount: value.auxCount,
        rank: value.rank,
        pool: value.pool,
        motorUpperMs: value.motorUpperMs,
      })),
      summary: summarizeOutcomes(outcomes, PARAMETERS),
    },
  };
}

function randomCases() {
  let state = 0x5EEDC0DE;
  const random = limit => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % limit;
  };
  const key = () => 'ABCDE'[random(5)];
  const code = length => Array.from({length}, key).join('');
  const result = [];
  for (const contract of ['traditional-21x21', 'four-code-top']) {
    for (let sample = 0; sample < 8; sample++) {
      const rows = [];
      for (const [kind, count] of [['character', 10], ['word2', 18], ['word3', 14], ['word4', 18]]) {
        for (let i = 0; i < count; i++) {
          const weight = 1 + random(9);
          let paths;
          let baseLength;
          if (kind === 'character') {
            const base = code(2);
            const first = key(), second = key();
            paths = [base, base + first, base + first + second];
            baseLength = 2;
          } else if (kind === 'word3') {
            const base = code(3);
            const first = key(), second = key();
            if (contract === 'four-code-top') {
              const routed = base + key();
              paths = [base, routed, routed + first, routed + first + second];
              baseLength = 4;
            } else {
              paths = [base, base + first, base + first + second];
              baseLength = 3;
            }
          } else {
            const base = code(4);
            const first = key(), second = key();
            paths = [base, base + first, base + first + second];
            baseLength = 4;
          }
          rows.push(row(`r${sample}-${kind}-${i}`, kind, weight, baseLength, contract, paths));
        }
      }
      result.push(makeCase(`${contract}-random-${sample}`, contract, rows));
    }
  }
  return result;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const output = path.resolve(args.output || path.join(__dirname, '..', 'tests', 'fixtures', 'ckt_v4_kernel_reference.json'));
  const fixture = {
    version: 'ckt-v4-js-reference-1',
    source: 'tools/ckt_v4_model.js',
    keyAlphabet: ALPHABET,
    cognitiveParameters: PARAMETERS,
    cases: [
      makeCase('traditional-21x21-joint-pool', 'traditional-21x21', traditionalRows()),
      makeCase('four-code-top-residual-joint-pool', 'four-code-top', fourCodeTopRows()),
      ...randomCases(),
    ],
  };
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  process.stderr.write(`wrote ${output}\n`);
}

main();
