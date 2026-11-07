#!/usr/bin/env node
"use strict";

/* Score one 21x26 scheme under the fixed CKT v5 and v5.1 production policies. */

const fs = require("node:fs");
const path = require("node:path");
const { auxiliarySemantics } = require("./auxiliary_semantics.js");

const TRACK_WEIGHTS = Object.freeze({ character: 1, word2: 3, word3: 1, word4: 1 });
const V5_POLICIES = Object.freeze({
  candidate: {
    keytao: { word2: "12", word3: "21", word4: "42" },
    sanpin: { word2: "12", word3: "21", word4: "13" },
  },
  reference: {
    keytao: { word2: "12", word3: "21", word4: "24" },
    sanpin: { word2: "12", word3: "21", word4: "23" },
  },
});
const V51_POLICIES = Object.freeze({
  candidate: {
    keytao: { word2: "12", word3: "21", word4: "14" },
    sanpin: { word2: "12", word3: "21", word4: "13" },
  },
  reference: {
    keytao: { word2: "12", word3: "213", word4: "24" },
    sanpin: { word2: "12", word3: "213", word4: "23" },
  },
});

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    if (!argv[index].startsWith("--")) continue;
    args[argv[index].slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--")
      ? argv[++index]
      : true;
  }
  return args;
}

function terminal(outcomes, kind) {
  const selected = outcomes.filter(row => row.kind === kind);
  const byTerminal = new Map();
  for (const row of selected) {
    const key = `${row.pool}\0${row.code}`;
    if (!byTerminal.has(key)) byTerminal.set(key, []);
    byTerminal.get(key).push(row);
  }
  const residual = selected.filter(row => row.rank > 1);
  const keys = new Set(residual.map(row => `${row.pool}\0${row.code}`));
  return {
    buckets: keys.size,
    residualEntries: residual.length,
    maxBucketSize: Math.max(0, ...[...keys].map(key =>
      Math.max(...byTerminal.get(key).map(row => row.rank)))),
  };
}

function normalizedScore(modes, reference) {
  let fourth = 0;
  let denominator = 0;
  for (const mode of ["keytao", "sanpin"]) {
    for (const [kind, weight] of Object.entries(TRACK_WEIGHTS)) {
      fourth += weight * (modes[mode].tracks[kind].effectiveMs /
        reference[mode].tracks[kind].effectiveMs) ** 4;
      denominator += weight;
    }
  }
  return 10 * (fourth / denominator) ** 0.25;
}

function aggregateModes(modes) {
  const fields = [
    "motorUpperMs", "cognitiveMs", "effectiveMs", "firstAuxRate",
    "secondAuxRate", "thirdAuxRate", "selectionRate",
    "meanRejectedCandidates", "meanPageActions", "meanKeys",
  ];
  const result = Object.fromEntries(fields.map(field => [field, 0]));
  let denominator = 0;
  for (const mode of ["keytao", "sanpin"]) {
    for (const [kind, weight] of Object.entries(TRACK_WEIGHTS)) {
      const track = modes[mode].tracks[kind];
      for (const field of fields) {
        const value = field === "cognitiveMs" && !Number.isFinite(track[field])
          ? track.effectiveMs - track.motorUpperMs
          : track[field] || 0;
        result[field] += weight * value;
      }
      denominator += weight;
    }
  }
  for (const field of fields) result[field] /= denominator;
  return result;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.id || !args.html || !args.snow || !args.output) {
    throw new Error("usage: --id ID --html HTML --snow DIR --output JSON");
  }
  const benchmark = path.resolve(__dirname, "..");
  const snow = path.resolve(args.snow);
  const model = require(path.join(benchmark, "tools/ckt_v4_model.js"));
  const scorer = require(path.join(benchmark, "tools/score_completion_ckt_v4.js"));
  const { buildRowsForOrder } = require(path.join(
    snow, "scripts/research/evaluate_ckt_v4_word_aux_order.js"));
  const { buildExtendedWord3Rows, summarize } = require(path.join(
    snow, "scripts/research/evaluate_ckt51_aux_order.js"));

  const data = scorer.loadPayload(path.resolve(args.html));
  const entry = data.entries.find(value => value.id === args.id);
  const referenceEntry = data.entries.find(value => value.id === "S005");
  if (!entry) throw new Error(`unknown scheme id: ${args.id}`);
  if (!referenceEntry) throw new Error("missing S005 reference");
  if (entry.capacity[0] !== 21 || entry.capacity[1] !== 26) {
    throw new Error(`scheme is not 21x26: ${entry.capacity}`);
  }
  const strokes = scorer.strokeOptions(path.join(snow, "rime-stroke/stroke.dict.yaml"));
  const words = scorer.multiwords(path.join(snow, "snow_pinyin.base.dict.yaml"), data, 0.99);
  const snapshot = JSON.parse(fs.readFileSync(
    path.join(benchmark, "tools/ckt_v4_upstream_role_tables.json"), "utf8"));
  const motor = model.projectedMotor(
    model.upstreamMotor(snapshot), snapshot.keys, data.ckt.calibration.extension_maps);

  function characterTrack(scheme, mode) {
    const rows = scorer.buildRows(scheme, data, strokes, words, mode)
      .filter(row => row.kind === "character");
    return summarize(model.resolveCompetition(rows, { motorCost: motor }));
  }

  function evaluateV5Mode(scheme, mode, policy) {
    const characterRows = scorer.buildRows(scheme, data, strokes, words, mode)
      .filter(row => row.kind === "character");
    const wordRows = Object.entries(policy).flatMap(([kind, order]) =>
      buildRowsForOrder(scheme, data, words, mode, scheme.tone, kind, order, model));
    const outcomes = model.resolveCompetition([...characterRows, ...wordRows], { motorCost: motor });
    const summary = model.summarizeOutcomes(outcomes, {
      ...model.DEFAULT_COGNITIVE_PRIOR,
      pageSize: 6,
    });
    return { tracks: Object.fromEntries(Object.keys(TRACK_WEIGHTS).map(kind => [kind, summary[kind]])) };
  }

  function evaluateV51CandidateMode(scheme, mode, policy) {
    const wordRows = Object.entries(policy).flatMap(([kind, order]) =>
      buildRowsForOrder(scheme, data, words, mode, scheme.tone, kind, order, model));
    const outcomes = model.resolveCompetition(wordRows, { motorCost: motor });
    return {
      tracks: {
        character: characterTrack(scheme, mode),
        ...Object.fromEntries(["word2", "word3", "word4"].map(kind =>
          [kind, summarize(outcomes.filter(row => row.kind === kind))])),
      },
      terminal: Object.fromEntries(["word2", "word3", "word4"].map(kind =>
        [kind, terminal(outcomes, kind)])),
    };
  }

  function evaluateV51ReferenceMode(scheme, mode, policy) {
    const word2 = buildRowsForOrder(scheme, data, words, mode, scheme.tone, "word2", policy.word2, model);
    const word4 = buildRowsForOrder(scheme, data, words, mode, scheme.tone, "word4", policy.word4, model);
    const pair = model.resolveCompetition([...word2, ...word4], { motorCost: motor });
    const word3 = buildExtendedWord3Rows(
      scheme, data, words, mode, scheme.tone, policy.word3);
    const three = model.resolveCompetition(word3, { motorCost: motor });
    return { tracks: {
      character: characterTrack(scheme, mode),
      word2: summarize(pair.filter(row => row.kind === "word2")),
      word3: summarize(three),
      word4: summarize(pair.filter(row => row.kind === "word4")),
    } };
  }

  const v5Reference = Object.fromEntries(["keytao", "sanpin"].map(mode =>
    [mode, evaluateV5Mode(referenceEntry, mode, V5_POLICIES.reference[mode])]));
  const v5Modes = Object.fromEntries(["keytao", "sanpin"].map(mode =>
    [mode, evaluateV5Mode(entry, mode, V5_POLICIES.candidate[mode])]));
  const v51Reference = Object.fromEntries(["keytao", "sanpin"].map(mode =>
    [mode, evaluateV51ReferenceMode(referenceEntry, mode, V51_POLICIES.reference[mode])]));
  const v51Modes = Object.fromEntries(["keytao", "sanpin"].map(mode =>
    [mode, evaluateV51CandidateMode(entry, mode, V51_POLICIES.candidate[mode])]));

  const output = {
    version: "ckt-v5-v5.1-fixed-21x26-production-policies-1",
    id: entry.id,
    auxiliarySemantics: auxiliarySemantics(entry.tone),
    pageSize: 6,
    trackWeights: TRACK_WEIGHTS,
    cktV5: {
      score: normalizedScore(v5Modes, v5Reference),
      policies: V5_POLICIES,
      aggregate: aggregateModes(v5Modes),
      modes: v5Modes,
    },
    cktV51: {
      score: normalizedScore(v51Modes, v51Reference),
      policies: V51_POLICIES,
      aggregate: aggregateModes(v51Modes),
      modes: v51Modes,
    },
  };
  fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
  fs.writeFileSync(path.resolve(args.output), `${JSON.stringify(output, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    id: output.id,
    cktV5: output.cktV5.score,
    cktV51: output.cktV51.score,
  })}\n`);
}

if (require.main === module) main();

