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
} = require('./analyze_toned_2121_weighted_components.js');

const SHAPE_KEYS_BY_MEANING = 'QOLAP';
const WORD_POLICY = Object.freeze({word2: '21', word3: '213', word4: '23'});

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    if (!argv[index].startsWith('--')) continue;
    args[argv[index].slice(2)] = argv[index + 1] && !argv[index + 1].startsWith('--')
      ? argv[++index] : true;
  }
  return args;
}

function compatible(left, right, inventory) {
  if (left.property === right.property && left.family === right.family) return false;
  const decomposition = inventory.decomposition;
  const overlap = (first, second, firstProperty, secondProperty) =>
    first.property === firstProperty && second.property === secondProperty &&
    decomposition.some(value => value[firstProperty] === first.family &&
      value[secondProperty] === second.family);
  if (overlap(left, right, 'initial', 'shengjie') ||
      overlap(right, left, 'initial', 'shengjie')) return false;
  if (overlap(left, right, 'rhymeBody', 'fullFinal') ||
      overlap(right, left, 'rhymeBody', 'fullFinal')) return false;
  return true;
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
  const auditFile = path.resolve(args.audit ||
    path.join(root, 'research/notes/2026-11-09-ckt-v51-toned-2121-weighted-components.json'));
  const output = path.resolve(args.output ||
    path.join(root, 'research/notes/2026-11-09-ckt-v51-toned-2121-weighted-lowm-pairs.json'));
  const candidateCount = Number(args.candidates || 12);
  const mode = String(args.mode || 'mixed');

  const data = scorer.loadPayload(html);
  const words = scorer.multiwords(path.join(snow, 'snow_pinyin.base.dict.yaml'), data, 0.99);
  const strokes = scorer.strokeOptions(path.join(snow, 'rime-stroke/stroke.dict.yaml'));
  const bundle = JSON.parse(fs.readFileSync(layoutsFile, 'utf8'));
  const inventory = JSON.parse(fs.readFileSync(seedsFile, 'utf8'));
  const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
  const contract = buildToned2121Contract();
  const motor = projectedMotor(data);
  const reference = buildReference({data, words, strokes, motor, snow});
  const base = bundle.layouts[0];
  let candidateRows = audit.fullCktSingleMoveAudit;
  if (mode === 'initial') {
    candidateRows = candidateRows.filter(value => value.move.property === 'initial');
    candidateRows = [...new Map(candidateRows.map(value =>
      [value.move.family, value])).values()];
  } else if (mode !== 'mixed') {
    throw new Error(`unknown mode ${mode}`);
  }
  const candidates = candidateRows.slice(0, candidateCount).map(value => value.move);
  const pairs = [];
  for (let left = 0; left < candidates.length; left++) {
    for (let right = left + 1; right < candidates.length; right++) {
      if (!compatible(candidates[left], candidates[right], inventory)) continue;
      let layout = familyMoveVariant(base, bundle, inventory, contract, candidates[left]);
      layout = familyMoveVariant(layout, bundle, inventory, contract, candidates[right]);
      const flying = flyingAudit(layout, bundle, inventory, contract);
      if (flying.shengjieFlying.length || flying.tonedFullFinalFlying.length) {
        throw new Error(`pair introduced flying: ${JSON.stringify({moves: [candidates[left], candidates[right]], flying})}`);
      }
      const {outcomes: _discardedOutcomes, ...result} = evaluateLayoutPolicy({
        layout,
        layouts: bundle,
        data,
        words,
        motor,
        reference,
        shapeKeysByMeaning: SHAPE_KEYS_BY_MEANING,
        policy: WORD_POLICY,
      });
      pairs.push({
        moves: [candidates[left], candidates[right]],
        MGuard: 14,
        score: result.score,
        deltaVsM12: result.score - audit.base.score,
        tracks: result.tracks,
        flyingAudit: flying,
      });
    }
  }
  pairs.sort((left, right) => left.score - right.score);
  const report = {
    version: 'ckt-v5.1-toned-2121-weighted-lowm-pair-audit-1',
    base: audit.base,
    fixedEvaluation: audit.fixedEvaluation,
    candidateCount,
    mode,
    pairCount: pairs.length,
    compatibility: 'No repeated family; initial/shengjie and rhymeBody/fullFinal rules with overlapping token domains are not combined.',
    globalOptimality: 'not proven; complete pair audit only over the selected best single-rule candidates',
    candidates: audit.fullCktSingleMoveAudit.slice(0, candidateCount).map(value => ({
      move: value.move, score: value.score, deltaVsBase: value.deltaVsBase,
    })),
    pairs,
  };
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({output, pairCount: pairs.length,
    top: pairs.slice(0, 20).map(value => ({moves: value.moves, score: value.score,
      deltaVsM12: value.deltaVsM12}))}, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {compatible};
