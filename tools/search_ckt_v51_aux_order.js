#!/usr/bin/env node
"use strict";

/* Enumerate the full CKT v5.1 auxiliary-order space for one 21x21/21x26 scheme. */

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { auxiliarySemantics } = require("./auxiliary_semantics.js");

const PAGE_SIZE = 6;
const BASELINE = Object.freeze({
  firstAuxMs: 300,
  secondAuxMs: 300,
  thirdAuxMs: 300,
  selectionDecisionMs: 600,
  scanPerCandidateMs: 50,
  pageActionMs: 300,
});
const TRACK_WEIGHTS = Object.freeze({ character: 1, word2: 3, word3: 1, word4: 1 });
const REFERENCE_POLICIES = Object.freeze({
  keytao: { word2: "12", word3: "213", word4: "24" },
  sanpin: { word2: "12", word3: "213", word4: "23" },
});
const LENGTH_BALANCE = Object.freeze({
  version: "soft-page-fill-v2",
  pageSize: PAGE_SIZE,
  maximumCandidates: 120,
  minimumInputLength: 4,
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

function policyKey(word2, word3, word4) {
  return `${word2}/${word3}/${word4}`;
}

function characterTrack(entry, mode, context) {
  const rows = context.scorer.buildRows(
    entry, context.data, context.strokes, context.words, mode,
  ).filter(row => row.kind === "character");
  return context.summarize(context.model.resolveCompetition(rows, { motorCost: context.motor }));
}

function enumerateMode(entry, mode, context) {
  const traditional21x21 = context.model.classifyContract(entry.capacity) !== "four-code-top";
  const word2Orders = context.orderedDistinctPairs(2);
  const word3Orders = traditional21x21
    ? context.permutations(3)
    : context.orderedDistinctPairs(3);
  const word4Orders = context.orderedDistinctPairs(4);
  const rows = {};
  for (const [kind, orders] of Object.entries({
    word2: word2Orders,
    word3: word3Orders,
    word4: word4Orders,
  })) {
    rows[kind] = new Map(orders.map(order => [
      order,
      traditional21x21 && kind === "word3"
        ? context.buildExtendedWord3Rows(
            entry, context.data, context.words, mode, entry.tone, order,
          )
        : context.buildRowsForOrder(
            entry, context.data, context.words, mode, entry.tone, kind, order, context.model,
          ),
    ]));
  }
  const character = characterTrack(entry, mode, context);
  const results = [];
  if (traditional21x21) {
    const pairTracks = new Map();
    for (const word2 of word2Orders) for (const word4 of word4Orders) {
      const outcomes = context.model.resolveCompetition([
        ...rows.word2.get(word2), ...rows.word4.get(word4),
      ], { motorCost: context.motor });
      pairTracks.set(`${word2}/${word4}`, {
        word2: context.summarize(outcomes.filter(row => row.kind === "word2")),
        word4: context.summarize(outcomes.filter(row => row.kind === "word4")),
      });
    }
    const word3Tracks = new Map(word3Orders.map(order => [
      order,
      context.summarize(context.model.resolveCompetition(
        rows.word3.get(order), { motorCost: context.motor },
      )),
    ]));
    for (const word2 of word2Orders) for (const word3 of word3Orders) {
      for (const word4 of word4Orders) {
        const pair = pairTracks.get(`${word2}/${word4}`);
        results.push({
          policy: { word2, word3, word4 },
          policyKey: policyKey(word2, word3, word4),
          tracks: {
            character,
            word2: pair.word2,
            word3: word3Tracks.get(word3),
            word4: pair.word4,
          },
        });
      }
    }
  } else {
    for (const word2 of word2Orders) for (const word3 of word3Orders) {
      for (const word4 of word4Orders) {
        const outcomes = context.model.resolveCompetition([
          ...rows.word2.get(word2),
          ...rows.word3.get(word3),
          ...rows.word4.get(word4),
        ], { motorCost: context.motor, lengthBalance: LENGTH_BALANCE });
        results.push({
          policy: { word2, word3, word4 },
          policyKey: policyKey(word2, word3, word4),
          tracks: {
            character,
            word2: context.summarize(outcomes.filter(row => row.kind === "word2")),
            word3: context.summarize(outcomes.filter(row => row.kind === "word3")),
            word4: context.summarize(outcomes.filter(row => row.kind === "word4")),
          },
        });
      }
    }
  }
  return {
    schemeId: entry.id,
    schemeName: entry.name,
    mode,
    ...auxiliarySemantics(entry.tone),
    word3Contract: traditional21x21 ? "AAA+BBB" : "AAAU+BB",
    policySpace: { word2: word2Orders, word3: word3Orders, word4: word4Orders },
    resultCount: results.length,
    results,
  };
}

function referenceMode(entry, mode, policy, context) {
  const word2 = context.buildRowsForOrder(
    entry, context.data, context.words, mode, entry.tone, "word2", policy.word2, context.model,
  );
  const word4 = context.buildRowsForOrder(
    entry, context.data, context.words, mode, entry.tone, "word4", policy.word4, context.model,
  );
  const paired = context.model.resolveCompetition([...word2, ...word4], {
    motorCost: context.motor,
  });
  const word3 = context.buildExtendedWord3Rows(
    entry, context.data, context.words, mode, entry.tone, policy.word3,
  );
  const three = context.model.resolveCompetition(word3, { motorCost: context.motor });
  return {
    policy,
    policyKey: policyKey(policy.word2, policy.word3, policy.word4),
    tracks: {
      character: characterTrack(entry, mode, context),
      word2: context.summarize(paired.filter(row => row.kind === "word2")),
      word3: context.summarize(three),
      word4: context.summarize(paired.filter(row => row.kind === "word4")),
    },
  };
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
  const {
    buildRowsForOrder,
    orderedDistinctPairs,
  } = require(path.join(snow, "scripts/research/evaluate_ckt_v4_word_aux_order.js"));
  const {
    buildExtendedWord3Rows,
    permutations,
    summarize,
  } = require(path.join(snow, "scripts/research/evaluate_ckt51_aux_order.js"));

  const data = scorer.loadPayload(path.resolve(args.html));
  const entry = data.entries.find(value => value.id === args.id);
  const reference = data.entries.find(value => value.id === "S005");
  if (!entry) throw new Error(`unknown scheme ${args.id}`);
  if (!reference) throw new Error("missing S005 reference");
  if (!["21x21", "21x26"].includes(entry.capacity.join("x"))) {
    throw new Error(`expected 21x21 or 21x26 scheme, got ${entry.capacity.join("x")}`);
  }
  const strokes = scorer.strokeOptions(path.join(snow, "rime-stroke/stroke.dict.yaml"));
  const words = scorer.multiwords(
    path.join(snow, "snow_pinyin.base.dict.yaml"), data, Number(args.mass || 0.99),
  );
  const snapshot = JSON.parse(fs.readFileSync(
    path.join(benchmark, "tools/ckt_v4_upstream_role_tables.json"), "utf8",
  ));
  const motor = model.projectedMotor(
    model.upstreamMotor(snapshot), snapshot.keys, data.ckt.calibration.extension_maps,
  );
  const context = {
    data,
    words,
    strokes,
    model,
    scorer,
    motor,
    buildRowsForOrder,
    orderedDistinctPairs,
    permutations,
    buildExtendedWord3Rows,
    summarize,
  };
  const cases = {};
  const references = {};
  for (const mode of ["keytao", "sanpin"]) {
    process.stderr.write(`enumerating ${entry.id}/${mode}\n`);
    cases[mode] = enumerateMode(entry, mode, context);
    references[mode] = referenceMode(reference, mode, REFERENCE_POLICIES[mode], context);
  }
  const output = {
    version: "ckt5.1-single-native-aux-order-components-3",
    id: entry.id,
    contract: {
      name: entry.capacity.join("x") === "21x21"
        ? "traditional-21x21-native-six-code"
        : "native-four-code-top-six-code",
      word2: "four main plus two auxiliaries",
      word3: entry.capacity.join("x") === "21x21"
        ? "three main plus three auxiliaries"
        : "four main plus two auxiliaries",
      word4: "four main plus two auxiliaries",
      pageSize: PAGE_SIZE,
      candidateRanking: entry.capacity.join("x") === "21x21"
        ? "word2+word4 joint same-length pool; independent staged word3 pool; no soft length balance"
        : "joint cross-length pool followed by deployed soft length balance",
    },
    lengthBalance: entry.capacity.join("x") === "21x21" ? null : {
      ...LENGTH_BALANCE,
      sourceCommit: execFileSync(
        "git", ["-C", snow, "log", "-1", "--format=%H", "--", "lua/snow/length_balance.lua"],
        { encoding: "utf8" },
      ).trim(),
      snowHead: execFileSync("git", ["-C", snow, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      sourceFile: "lua/snow/length_balance.lua",
      learnedPriority: "excluded: standardized frozen-corpus score has no personal user history",
      downstreamFilters: "fixed/postpone/simplified excluded, matching the historical CKT corpus scope",
    },
    trackWeights: TRACK_WEIGHTS,
    baselineCostsMs: BASELINE,
    corpus: {
      mass: Number(args.mass || 0.99),
      word2: words.word2.length,
      word3: words.word3.length,
      word4: words.word4.length,
    },
    policyCount: 144,
    referencePolicies: REFERENCE_POLICIES,
    references,
    cases,
  };
  const outputFile = path.resolve(args.output);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  process.stdout.write(`${outputFile}\n`);
}

if (require.main === module) main();
