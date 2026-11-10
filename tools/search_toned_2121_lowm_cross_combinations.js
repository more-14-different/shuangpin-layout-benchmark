#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const scorer = require('./score_completion_ckt_v4.js');
const {
  buildReference,
  evaluateLayoutPolicy,
  projectedMotor,
} = require('./score_toned_2121_ckt_v51.js');
const {buildToned2121Contract} = require('./toned_2121_contract.js');
const {
  familyMoveVariant,
  flyingAudit,
  offsetVariant,
} = require('./analyze_toned_2121_weighted_components.js');

const SHAPE_KEYS_BY_MEANING = 'QOLAP';
const WORD_POLICY = Object.freeze({word2: '21', word3: '213', word4: '23'});
const RHYME_GRAMMARS = Object.freeze([
  {name: 'M10-none', i: 0, u: 0, v: 0, fixed: null, M: 10},
  {name: 'M11-none-ian2', i: 0, u: 0, v: 0, fixed: ['ian', 2], M: 11},
  {name: 'M11-iu', i: -1, u: 1, v: 0, fixed: null, M: 11},
  {name: 'M12-iu-ou2', i: -1, u: 1, v: 0, fixed: ['ou', 2], M: 12},
  {name: 'M12-i-ou2', i: -1, u: 0, v: 0, fixed: ['ou', 2], M: 12},
  {name: 'M12-baseline', i: -1, u: 1, v: 2, fixed: null, M: 12},
  {name: 'M13-i-v-ou2', i: -1, u: 0, v: 2, fixed: ['ou', 2], M: 13},
]);
const FIRST_RULES = Object.freeze([
  {name: 'none', moves: []},
  {name: 'diK', moves: [{property: 'shengjie', position: 'first', family: 'di', destination: 'K'}]},
  {name: 'shuC', moves: [{property: 'shengjie', position: 'first', family: 'shu', destination: 'C'}]},
  {name: 'diK-shuC', moves: [
    {property: 'shengjie', position: 'first', family: 'di', destination: 'K'},
    {property: 'shengjie', position: 'first', family: 'shu', destination: 'C'},
  ]},
]);

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    if (!argv[index].startsWith('--')) continue;
    args[argv[index].slice(2)] = argv[index + 1] && !argv[index + 1].startsWith('--')
      ? argv[++index] : true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, '..');
  const html = path.resolve(args.html || path.join(root, 'a7_CKT_R11.html'));
  const snow = path.resolve(args.snow || 'D:/C2D/Documents/rime-snow-pinyin');
  const layoutsFile = path.resolve(args.layouts ||
    path.join(root, 'research/config/ckt-v51-toned-2121-M12-D0V0-finalists.json'));
  const seedsFile = path.resolve(args.seeds ||
    path.join(root, 'research/config/ckt-v51-toned-2121-seeds.json'));
  const output = path.resolve(args.output ||
    path.join(root, 'research/notes/2026-11-09-ckt-v51-toned-2121-lowm-cross-combinations.json'));

  const data = scorer.loadPayload(html);
  const words = scorer.multiwords(path.join(snow, 'snow_pinyin.base.dict.yaml'), data, 0.99);
  const strokes = scorer.strokeOptions(path.join(snow, 'rime-stroke/stroke.dict.yaml'));
  const bundle = JSON.parse(fs.readFileSync(layoutsFile, 'utf8'));
  const inventory = JSON.parse(fs.readFileSync(seedsFile, 'utf8'));
  const contract = buildToned2121Contract();
  const motor = projectedMotor(data);
  const reference = buildReference({data, words, strokes, motor, snow});
  const base = bundle.layouts[0];
  const results = [];
  for (const grammar of RHYME_GRAMMARS) for (const first of FIRST_RULES) {
    let layout = offsetVariant(base, bundle, inventory, contract,
      grammar.i, grammar.u, grammar.v);
    if (grammar.fixed) layout = familyMoveVariant(layout, bundle, inventory, contract,
      {property: 'fullFinal', position: 'second', family: grammar.fixed[0],
        destination: grammar.fixed[1]});
    for (const move of first.moves) {
      layout = familyMoveVariant(layout, bundle, inventory, contract, move);
    }
    const flying = flyingAudit(layout, bundle, inventory, contract);
    if (flying.shengjieFlying.length || flying.tonedFullFinalFlying.length) {
      throw new Error(`cross combination introduced flying: ${JSON.stringify({grammar, first, flying})}`);
    }
    const {outcomes: _discardedOutcomes, ...evaluation} = evaluateLayoutPolicy({
      layout,
      layouts: bundle,
      data,
      words,
      motor,
      reference,
      shapeKeysByMeaning: SHAPE_KEYS_BY_MEANING,
      policy: WORD_POLICY,
    });
    results.push({
      rhymeGrammar: grammar,
      firstRules: first,
      MRuleEstimate: grammar.M + first.moves.length,
      D: first.moves.length,
      V: grammar.fixed ? 1 : 0,
      score: evaluation.score,
      deltaVsM12: evaluation.score - 9.659329215730638,
      tracks: evaluation.tracks,
      flyingAudit: flying,
    });
  }
  results.sort((left, right) => left.score - right.score);
  const bestByM = [...new Set(results.map(value => value.MRuleEstimate))].sort()
    .map(M => results.filter(value => value.MRuleEstimate === M)
      .sort((left, right) => left.score - right.score)[0]);
  const cumulativeFrontier = bestByM.map(value => ({
    M: value.MRuleEstimate,
    bestAtOrBelow: results.filter(candidate => candidate.MRuleEstimate <= value.MRuleEstimate)
      .sort((left, right) => left.score - right.score)[0],
  }));
  const report = {
    version: 'ckt-v5.1-toned-2121-lowm-cross-combinations-1',
    fixedEvaluation: {shapeKeysByMeaning: SHAPE_KEYS_BY_MEANING, wordPolicy: WORD_POLICY},
    memoryCaveat: 'Grammar-relative rule estimate; final minimum-M proof and ergonomic robustness audit remain pending.',
    combinationCount: results.length,
    bestByM,
    cumulativeFrontier,
    results,
  };
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({output, bestByM: bestByM.map(value => ({
    M: value.MRuleEstimate,
    rhymeGrammar: value.rhymeGrammar.name,
    firstRules: value.firstRules.name,
    D: value.D,
    V: value.V,
    score: value.score,
    deltaVsM12: value.deltaVsM12,
  })), top: results.slice(0, 15).map(value => ({
    M: value.MRuleEstimate,
    rhymeGrammar: value.rhymeGrammar.name,
    firstRules: value.firstRules.name,
    score: value.score,
  }))}, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {FIRST_RULES, RHYME_GRAMMARS};
