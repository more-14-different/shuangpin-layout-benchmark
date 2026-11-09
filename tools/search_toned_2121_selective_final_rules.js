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
  buildExposure,
  familyMoveVariant,
  flyingAudit,
  offsetVariant,
  relocationRanking,
  tokenRecords,
} = require('./analyze_toned_2121_weighted_components.js');

const SHAPE_KEYS_BY_MEANING = 'QOLAP';
const WORD_POLICY = Object.freeze({word2: '21', word3: '213', word4: '23'});
const SEED_RULES = Object.freeze([
  {name: 'M10-none', i: 0, u: 0, v: 0},
  {name: 'M11-iu-pair', i: -1, u: 1, v: 0},
  {name: 'M11-v-only', i: 0, u: 0, v: 2},
  {name: 'M11-i-only', i: -1, u: 0, v: 0},
  {name: 'M11-u-only', i: 0, u: 1, v: 0},
  {name: 'M12-i-v', i: -1, u: 0, v: 2},
  {name: 'M12-u-v', i: 0, u: 1, v: 2},
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
    path.join(root, 'research/notes/2026-11-09-ckt-v51-toned-2121-selective-final-rules.json'));
  const finalistsPerSeed = Number(args.finalists || 10);

  const data = scorer.loadPayload(html);
  const words = scorer.multiwords(path.join(snow, 'snow_pinyin.base.dict.yaml'), data, 0.99);
  const strokes = scorer.strokeOptions(path.join(snow, 'rime-stroke/stroke.dict.yaml'));
  const bundle = JSON.parse(fs.readFileSync(layoutsFile, 'utf8'));
  const inventory = JSON.parse(fs.readFileSync(seedsFile, 'utf8'));
  const contract = buildToned2121Contract();
  const motor = projectedMotor(data);
  const reference = buildReference({data, words, strokes, motor, snow});
  const base = bundle.layouts[0];
  const weighted = buildExposure(data, words, bundle);
  const seeds = [];
  for (const rule of SEED_RULES) {
    const seed = offsetVariant(base, bundle, inventory, contract, rule.i, rule.u, rule.v);
    const records = tokenRecords(seed, bundle, inventory, weighted.exposure);
    const proxy = relocationRanking(records, 'fullFinal', 'second', contract, seed,
      weighted.exposureUnits).filter(value => value.deltaTop1Share > 0);
    const selected = proxy.slice(0, finalistsPerSeed);
    const candidates = [];
    for (const value of selected) {
      const move = {property: 'fullFinal', position: 'second', family: value.family,
        destination: value.destination, proxyDeltaTop1Share: value.deltaTop1Share};
      const layout = familyMoveVariant(seed, bundle, inventory, contract, move);
      const flying = flyingAudit(layout, bundle, inventory, contract);
      if (flying.shengjieFlying.length || flying.tonedFullFinalFlying.length) {
        throw new Error(`selective final introduced flying: ${JSON.stringify({rule, move, flying})}`);
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
      candidates.push({
        move,
        MRuleEstimate: seed.offsetRuleAudit.MRuleEstimate + 1,
        score: result.score,
        deltaVsM12: result.score - 9.659329215730638,
        tracks: result.tracks,
        flyingAudit: flying,
      });
    }
    candidates.sort((left, right) => left.score - right.score);
    seeds.push({
      name: rule.name,
      offsets: rule,
      offsetRuleAudit: seed.offsetRuleAudit,
      proxyCandidates: proxy.slice(0, 30),
      fullCktCandidates: candidates,
    });
  }
  const frontier = seeds.flatMap(seed => seed.fullCktCandidates.map(candidate => ({
    seed: seed.name,
    offsets: seed.offsets,
    ...candidate,
  }))).sort((left, right) => left.score - right.score);
  const report = {
    version: 'ckt-v5.1-toned-2121-selective-full-final-rules-1',
    objective: 'replace broad i/u/v rotations with fewer whole-full-final fixed-column rules while preserving no-flying',
    fixedEvaluation: {shapeKeysByMeaning: SHAPE_KEYS_BY_MEANING, wordPolicy: WORD_POLICY},
    memoryCaveat: 'MRuleEstimate reuses the M12 grammar: 10 non-offset rules + retained uniform offset rules + one fixed-full-final exception; it is not a global minimum proof.',
    finalistsPerSeed,
    seeds,
    frontier,
  };
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({output, top: frontier.slice(0, 30).map(value => ({
    seed: value.seed,
    offsets: value.offsets,
    move: value.move,
    MRuleEstimate: value.MRuleEstimate,
    score: value.score,
    deltaVsM12: value.deltaVsM12,
  }))}, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {SEED_RULES};
