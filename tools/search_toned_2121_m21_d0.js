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
const {
  applyFirstFamilyMove,
  applySecondFamilyShift,
  buildPinyinFamilies,
} = require('./search_toned_2121_constrained_ckt.js');
const {buildToned2121Contract} = require('./toned_2121_contract.js');

const FIXED_SHAPE_KEYS_BY_MEANING = 'QOLAP';
const SPECIAL_FIRST_FAMILIES = Object.freeze([
  '_', '_i', '_u', '_v', 'ch', 'chu', 'sh', 'shu', 'zh', 'zhu',
]);
const DEFAULT_POLICY = Object.freeze({word2: '21', word3: '213', word4: '23'});

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    if (!argv[index].startsWith('--')) continue;
    args[argv[index].slice(2)] = argv[index + 1] && !argv[index + 1].startsWith('--')
      ? argv[++index]
      : true;
  }
  return args;
}

function sampleCorpus(data, words, count) {
  return {
    data: {
      ...data,
      characters: [...data.characters].filter(row => row[4] && row[3] > 0)
        .sort((left, right) => right[3] - left[3]).slice(0, count),
    },
    words: Object.fromEntries(Object.entries(words).map(([kind, rows]) => [kind,
      [...rows].sort((left, right) => right.weight - left.weight).slice(0, count)])),
  };
}

function guard(specialMoves, rhymeMoves) {
  return {
    seedM: 12,
    deltaDOrdinary: 0,
    deltaSpecial: specialMoves,
    deltaV: rhymeMoves,
    MGuard: 12 + specialMoves + rhymeMoves,
    definition: 'MGuard=12+deltaSpecial+deltaV; ordinary shengjie displacement is frozen at zero',
  };
}

function makeCandidate(base, tonedCodes, moveHistory, move) {
  const history = [...moveHistory, move];
  const specialMoves = history.filter(value => value.kind === 'special-first-family').length;
  const rhymeMoves = history.filter(value => value.kind === 'second-family-shift').length;
  const suffix = move.kind === 'special-first-family'
    ? `S-${move.family}-${move.key}` : `V-${move.family}-${move.delta}`;
  return {
    ...base,
    id: `${base.id}-${suffix}`,
    origin: 'M21-low-ordinary-disorder-beam-search',
    parentId: base.id,
    tonedCodes,
    guard: guard(specialMoves, rhymeMoves),
    moveHistory: history,
    move,
  };
}

function scoreCandidate(layout, context, corpus) {
  return evaluateLayoutPolicy({
    layout,
    layouts: context.layouts,
    data: corpus.data,
    words: corpus.words,
    motor: context.motor,
    reference: context.reference,
    shapeKeysByMeaning: FIXED_SHAPE_KEYS_BY_MEANING,
    policy: DEFAULT_POLICY,
  }).score;
}

function atomicMoves(base, context) {
  const result = [];
  for (const family of SPECIAL_FIRST_FAMILIES) for (const key of context.contract.soundKeys) {
    const tonedCodes = applyFirstFamilyMove(base, context.layouts.tokenKeys,
      context.families, family, key);
    if (tonedCodes.every((code, index) => code === base.tonedCodes[index])) continue;
    result.push(makeCandidate(base, tonedCodes, [],
      {kind: 'special-first-family', family, key}));
  }
  for (const family of context.secondFamilies) for (let delta = 1; delta < 7; delta++) {
    result.push(makeCandidate(base, applySecondFamilyShift(base, context.layouts.tokenKeys,
      context.families, family, delta, context.contract), [],
    {kind: 'second-family-shift', family, delta}));
  }
  return result;
}

function selectMoveMenu(scored, specialPerFamily, rhymePerFamily) {
  const byFamily = new Map();
  for (const value of scored) {
    const move = value.layout.move;
    const key = `${move.kind}/${move.family}`;
    if (!byFamily.has(key)) byFamily.set(key, []);
    byFamily.get(key).push(value);
  }
  const menu = [];
  for (const values of byFamily.values()) {
    values.sort((left, right) => left.score - right.score);
    const count = values[0].layout.move.kind === 'special-first-family'
      ? specialPerFamily : rhymePerFamily;
    menu.push(...values.slice(0, count).map(value => value.layout.move));
  }
  return menu;
}

function rescoreMoveMenu(scored, context, corpus, specialPerFamily, rhymePerFamily,
  screenMultiplier) {
  const screenedMoves = selectMoveMenu(scored, specialPerFamily * screenMultiplier,
    rhymePerFamily * screenMultiplier);
  const byMove = new Map(scored.map(value => [JSON.stringify(value.layout.move), value]));
  const rescored = screenedMoves.map(move => {
    const value = byMove.get(JSON.stringify(move));
    return {
      layout: value.layout,
      sampleScore: value.score,
      score: scoreCandidate(value.layout, context, corpus),
    };
  }).sort((left, right) => left.score - right.score);
  return {
    rescored,
    menu: selectMoveMenu(rescored, specialPerFamily, rhymePerFamily),
  };
}

function applyMenuMove(base, move, context) {
  if (move.kind === 'special-first-family') {
    return applyFirstFamilyMove(base, context.layouts.tokenKeys, context.families,
      move.family, move.key);
  }
  return applySecondFamilyShift(base, context.layouts.tokenKeys, context.families,
    move.family, move.delta, context.contract);
}

function stateKey(layout) {
  return layout.tonedCodes.join('|');
}

function rememberState(seen, key) {
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

function beamSearch(base, context, menu, screenCorpus, rankingCorpus, maxMoves,
  beamWidth, screenMultiplier) {
  let beam = [{
    layout: {...base, moveHistory: []},
    sampleScore: scoreCandidate(base, context, screenCorpus),
    score: scoreCandidate(base, context, rankingCorpus),
  }];
  const frontier = [...beam];
  const seen = new Set([stateKey(base)]);
  const depthAudit = [];
  for (let depth = 1; depth <= maxMoves; depth++) {
    const proposals = [];
    for (const state of beam) {
      const used = new Set(state.layout.moveHistory.map(value => `${value.kind}/${value.family}`));
      for (const move of menu) {
        if (used.has(`${move.kind}/${move.family}`)) continue;
        const tonedCodes = applyMenuMove(state.layout, move, context);
        const candidate = makeCandidate(state.layout, tonedCodes,
          state.layout.moveHistory, move);
        if (candidate.guard.MGuard > 21) continue;
        const key = stateKey(candidate);
        if (!rememberState(seen, key)) continue;
        proposals.push({
          layout: candidate,
          sampleScore: scoreCandidate(candidate, context, screenCorpus),
        });
      }
    }
    proposals.sort((left, right) => left.sampleScore - right.sampleScore);
    const screened = proposals.slice(0, beamWidth * screenMultiplier).map(value => ({
      ...value,
      score: scoreCandidate(value.layout, context, rankingCorpus),
    })).sort((left, right) => left.score - right.score);
    beam = screened.slice(0, beamWidth);
    frontier.push(...beam);
    depthAudit.push({
      depth,
      proposed: proposals.length,
      reranked: screened.length,
      retained: beam.length,
      bestScore: beam[0]?.score ?? null,
      bestSampleScore: beam[0]?.sampleScore ?? null,
      bestGuard: beam[0]?.layout.guard ?? null,
      bestMoves: beam[0]?.layout.moveHistory ?? null,
    });
    if (!beam.length) break;
  }
  return {frontier, depthAudit};
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
  const outputLayouts = path.resolve(args['output-layouts'] ||
    path.join(root, 'research/config/ckt-v51-toned-2121-M21-D0-finalists.json'));
  const outputReport = path.resolve(args['output-report'] ||
    path.join(root, 'research/notes/2026-11-09-ckt-v51-toned-2121-M21-D0-search.json'));
  const sampleCount = Number(args.sample || 240);
  const resampleCount = Number(args.resample || 1800);
  const specialPerFamily = Number(args['special-per-family'] || 3);
  const rhymePerFamily = Number(args['rhyme-per-family'] || 2);
  const beamWidth = Number(args['beam-width'] || 10);
  const maxMoves = Number(args['max-moves'] || 9);
  const prefinalists = Number(args.prefinalists || (beamWidth * maxMoves + 1));
  const finalists = Number(args.finalists || 3);
  const screenMultiplier = Number(args['screen-multiplier'] || 5);

  const data = scorer.loadPayload(html);
  const words = scorer.multiwords(path.join(snow, 'snow_pinyin.base.dict.yaml'), data, 0.99);
  const strokes = scorer.strokeOptions(path.join(snow, 'rime-stroke/stroke.dict.yaml'));
  const motor = projectedMotor(data);
  const layouts = JSON.parse(fs.readFileSync(layoutsFile, 'utf8'));
  const seeds = JSON.parse(fs.readFileSync(seedsFile, 'utf8'));
  const reference = buildReference({data, words, strokes, motor, snow});
  const contract = buildToned2121Contract();
  const base = layouts.layouts[0];
  if (!base || base.structuralGuard?.M !== 12) {
    throw new Error('expected the M12 D0/V0 physical finalist as the base layout');
  }
  base.guard = guard(0, 0);
  base.moveHistory = [];
  const context = {
    data, words, motor, reference, contract, layouts,
    families: buildPinyinFamilies(seeds),
    secondFamilies: [...new Set(seeds.decomposition.map(value => value.rhymeBody))].sort(),
  };
  const sample = sampleCorpus(data, words, sampleCount);
  const resample = sampleCorpus(data, words, resampleCount);
  const atomics = atomicMoves(base, context).map(layout => ({
    layout,
    score: scoreCandidate(layout, context, sample),
  })).sort((left, right) => left.score - right.score);
  const atomicRanking = rescoreMoveMenu(atomics, context, resample,
    specialPerFamily, rhymePerFamily, screenMultiplier);
  const menu = atomicRanking.menu;
  const beam = beamSearch(base, context, menu, sample, resample, maxMoves,
    beamWidth, screenMultiplier);
  const unique = new Map(beam.frontier.map(value => [stateKey(value.layout), value]));
  const resampled = [...unique.values()].sort((left, right) => left.score - right.score);
  const shortlist = resampled.slice(0, prefinalists).map(value => {
    const {outcomes: _discardedOutcomes, ...fixedPolicyFullResult} = evaluateLayoutPolicy({
      layout: value.layout,
      layouts,
      data,
      words,
      motor,
      reference,
      shapeKeysByMeaning: FIXED_SHAPE_KEYS_BY_MEANING,
      policy: DEFAULT_POLICY,
    });
    return {...value, fixedPolicyFullResult,
      fixedPolicyFull: fixedPolicyFullResult.score};
  }).sort((left, right) => left.fixedPolicyFull - right.fixedPolicyFull);
  const final = shortlist.slice(0, finalists).map(value => ({
    layout: value.layout,
    sampleScore: value.score,
    fixedPolicyFull: value.fixedPolicyFull,
    result: value.fixedPolicyFullResult,
  })).sort((left, right) => left.result.score - right.result.score);
  const fullCorpusAudit = shortlist.map(value => ({
    id: value.layout.id,
    guard: value.layout.guard,
    moveHistory: value.layout.moveHistory,
    resampleScore: value.score,
    score: value.fixedPolicyFull,
  }));
  const bestByM = [...new Set(fullCorpusAudit.map(value => value.guard.MGuard))]
    .sort((left, right) => left - right)
    .map(MGuard => fullCorpusAudit.filter(value => value.guard.MGuard === MGuard)
      .sort((left, right) => left.score - right.score)[0]);
  const report = {
    version: 'ckt-v5.1-toned-2121-M21-Dordinary0-beam-search-1',
    objective: 'minimize full shape-only CKT v5.1 under M<=21 and ordinary-shengjie displacement D=0',
    base: {
      id: base.id,
      score: 9.659329215730638,
      M: 12,
      deltaDOrdinary: 0,
      deltaSpecial: 0,
      deltaV: 0,
    },
    guardSemantics: {
      deltaDOrdinary: 'ordinary single-letter initial/medial families are frozen at the M12 placement',
      deltaSpecial: `movable without D penalty but with +1 M each: ${SPECIAL_FIRST_FAMILIES.join(', ')}`,
      deltaV: 'one rhyme-body family cyclic reassignment costs +1 M',
      MGuard: '12 + deltaSpecial + deltaV <= 21',
      toneMergeM: 0,
    },
    search: {
      atomicCandidates: atomics.length,
      specialTargetsRetainedPerFamily: specialPerFamily,
      rhymeDeltasRetainedPerFamily: rhymePerFamily,
      screenMultiplier,
      atomicRerankedCandidates: atomicRanking.rescored.length,
      moveMenu: menu,
      sampleRowsPerTrack: sampleCount,
      resampleRowsPerTrack: resampleCount,
      beamWidth,
      maxMoves,
      depthAudit: beam.depthAudit,
      uniqueFrontierStates: unique.size,
      fullFixedPolicyPrefinalists: shortlist.length,
      fullCorpusFinalists: final.length,
      fixedShapeKeysByMeaning: FIXED_SHAPE_KEYS_BY_MEANING,
      shapeMeaningOrdersSearched: 1,
      fixedWordPolicy: DEFAULT_POLICY,
      wordPoliciesSearched: 1,
      globalOptimality: 'not proven; atomic pruning and finite beam search are heuristic',
    },
    atomicTop: atomicRanking.rescored.slice(0, 30).map(value => ({
      score: value.score,
      sampleScore: value.sampleScore,
      move: value.layout.move,
      guard: value.layout.guard,
    })),
    fullCorpusAudit,
    bestByM,
    finalists: final.map(value => ({
      id: value.layout.id,
      guard: value.layout.guard,
      moveHistory: value.layout.moveHistory,
      sampleScore: value.sampleScore,
      fixedPolicyFull: value.fixedPolicyFull,
      score: value.result.score,
      shapeKeysByMeaning: value.result.shapeKeysByMeaning,
      toneKeysByTone: value.result.toneKeysByTone,
      policy: value.result.policy,
      tracks: value.result.tracks,
      shapeMeaningSearch: 'not searched; QOLAP fixed from prior empirical results',
      wordPolicySearch: 'not searched; 21/213/23 fixed from the M12 D0/V0 seed',
    })),
  };
  const output = {
    ...layouts,
    version: 'ckt-v5.1-toned-2121-M21-Dordinary0-finalists-1',
    layouts: final.map(value => ({
      ...value.layout,
      recommendedShapeKeysByMeaning: value.result.shapeKeysByMeaning,
      recommendedToneKeysByTone: value.result.toneKeysByTone,
      recommendedPolicy: value.result.policy,
    })),
  };
  fs.mkdirSync(path.dirname(outputLayouts), {recursive: true});
  fs.mkdirSync(path.dirname(outputReport), {recursive: true});
  fs.writeFileSync(outputLayouts, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputReport, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
  SPECIAL_FIRST_FAMILIES,
  guard,
  rememberState,
  selectMoveMenu,
};
