#!/usr/bin/env node
"use strict";

/*
 * Score the production Snow Jiandao layout without pretending that its
 * tone-in-main contract is an ordinary untoned R11 entry.  The output is a
 * compact, auditable bridge for the cross-contract table in a7_CKT_R11.html.
 */

const fs = require("node:fs");
const path = require("node:path");
const model = require("./ckt_v4_model.js");
const scorer = require("./score_completion_ckt_v4.js");
const toned = require("./score_toned_2121_ckt_v51.js");
const {physicalShape, toneKeysFromShapeKeys, shapeKeysFromToneKeys} = require("./auxiliary_semantics.js");

const TRACK_WEIGHTS = Object.freeze({character: 1, word2: 3, word3: 1, word4: 1});
const V5_POLICY = Object.freeze({word2: "12", word3: "21", word4: "24"});
const V51_POLICY = Object.freeze({word2: "12", word3: "213", word4: "24"});
const KEYS = "QWERTYUIOPASDFGHJKLZXCVBNM";
const HOME = new Set("ASDFGHJKL");
const RIGHT_PINKY = new Set("P");
const LEFT_PINKY = new Set("QAZ");
const TYB = new Set("TYB");
const FINGER = Object.freeze({
  Q: 0, A: 0, Z: 0,
  W: 1, S: 1, X: 1,
  E: 2, D: 2, C: 2,
  R: 3, F: 3, V: 3, T: 3, G: 3, B: 3,
  Y: 6, H: 6, N: 6, U: 6, J: 6, M: 6,
  I: 7, K: 7, O: 8, L: 8, P: 9,
});

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    if (!argv[index].startsWith("--")) continue;
    args[argv[index].slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--")
      ? argv[++index] : true;
  }
  return args;
}

function fixtureAdapter(fixture, data) {
  if (fixture.pinyin.join("\0") !== data.pinyin.join("\0")) {
    throw new Error("fixture and R11 pinyin inventories differ");
  }
  const tokenKeys = [];
  const tonedCodes = [];
  for (let py = 0; py < fixture.tonedCodes.length; py++) {
    for (let tone = 1; tone <= 5; tone++) {
      const code = fixture.tonedCodes[py][tone - 1];
      if (!code) continue;
      tokenKeys.push(`${data.pinyin[py]}${tone}`);
      tonedCodes.push(code);
    }
  }
  return {
    inventory: {tokenKeys},
    layout: {
      id: fixture.layoutId,
      tonedCodes,
      declaredMemory: {
        M: fixture.publication?.memoryAudit?.memoryLower ?? fixture.baselineMemoryLower + 1,
        lower: fixture.publication?.memoryAudit?.memoryLower ?? fixture.baselineMemoryLower + 1,
        guard: fixture.publication?.memoryAudit?.memoryGuard ?? fixture.baselineMemoryGuard + 1,
      },
    },
  };
}

function simpleStage(code) {
  return {length: [...code].length, codes: [code]};
}

function v5Word3Rows(layout, inventory, data, words, toneKeysByTone, order) {
  const byToken = new Map(inventory.tokenKeys.map((token, index) =>
    [token, layout.tonedCodes[index]]));
  const shape = data.shapes.snowshape;
  const rows = [];
  for (let index = 0; index < words.word3.length; index++) {
    const item = words.word3[index];
    const codes = item.py.map((py, at) =>
      byToken.get(`${data.pinyin[py]}${item.tones[at]}`));
    if (codes.some(value => !value)) continue;
    const chars = [...item.text];
    const aux = [...order].map(position => {
      const physical = physicalShape(shape[chars[Number(position) - 1]], toneKeysByTone);
      return physical[0];
    });
    if (aux.some(value => !value)) continue;
    const stem = codes.map(value => value[0]).join("");
    const stages = [stem];
    for (const key of aux) stages.push(stages[stages.length - 1] + key);
    rows.push({
      id: `word3:${index}`,
      text: item.text,
      kind: "word3",
      weight: item.weight,
      baseLength: 3,
      stages: model.makeStages("traditional-21x21", "word3", stages.map(simpleStage)),
    });
  }
  return rows;
}

function normalizedScore(tracks, reference) {
  let fourth = 0;
  let denominator = 0;
  for (const [kind, weight] of Object.entries(TRACK_WEIGHTS)) {
    fourth += weight * (tracks[kind].effectiveMs / reference[kind].effectiveMs) ** 4;
    denominator += weight;
  }
  return 10 * (fourth / denominator) ** 0.25;
}

function evaluateV5({layout, inventory, data, words, motor, reference, shapeKeysByMeaning}) {
  const toneKeysByTone = toneKeysFromShapeKeys(shapeKeysByMeaning);
  const rows = [
    ...toned.buildCharacterRows(layout, inventory, data, toneKeysByTone),
    ...toned.buildWordRows(layout, inventory, data, words, toneKeysByTone,
      "word2", V5_POLICY.word2),
    ...v5Word3Rows(layout, inventory, data, words, toneKeysByTone, V5_POLICY.word3),
    ...toned.buildWordRows(layout, inventory, data, words, toneKeysByTone,
      "word4", V5_POLICY.word4),
  ];
  const outcomes = model.resolveCompetition(rows, {motorCost: motor});
  const summarized = model.summarizeOutcomes(outcomes, {
    ...model.DEFAULT_COGNITIVE_PRIOR,
    pageSize: 6,
  });
  const tracks = Object.fromEntries(Object.keys(TRACK_WEIGHTS).map(kind =>
    [kind, summarized[kind]]));
  return {score: normalizedScore(tracks, reference), tracks, outcomes};
}

function v5Reference({data, words, strokes, motor, snow}) {
  const entry = data.entries.find(value => value.id === "S005");
  const {buildRowsForOrder} = require(path.join(
    snow, "scripts/research/evaluate_ckt_v4_word_aux_order.js"));
  const rows = [
    ...scorer.buildRows(entry, data, strokes, words, "keytao")
      .filter(value => value.kind === "character"),
    ...Object.entries(V5_POLICY).flatMap(([kind, order]) =>
      buildRowsForOrder(entry, data, words, "keytao", entry.tone,
        kind, order, model)),
  ];
  const outcomes = model.resolveCompetition(rows, {motorCost: motor});
  const summary = model.summarizeOutcomes(outcomes, {
    ...model.DEFAULT_COGNITIVE_PRIOR,
    pageSize: 6,
  });
  return Object.fromEntries(Object.keys(TRACK_WEIGHTS).map(kind => [kind, summary[kind]]));
}

function weightedAggregate(tracks, fields) {
  const denominator = Object.values(TRACK_WEIGHTS).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(fields.map(field => [field,
    Object.entries(TRACK_WEIGHTS).reduce((sum, [kind, weight]) =>
      sum + weight * (tracks[kind][field] || 0), 0) / denominator]));
}

function loadMetric(outcomes) {
  const load = Object.fromEntries([...KEYS].map(key => [key, 0]));
  let strokes = 0;
  let transitionWeight = 0;
  let differentKeySameFinger = 0;
  for (const row of outcomes) {
    const code = [...row.code];
    for (const key of code) {
      if (!(key in load)) throw new Error(`unsupported native key ${key}`);
      load[key] += row.weight;
      strokes += row.weight;
    }
    for (let index = 1; index < code.length; index++) {
      transitionWeight += row.weight;
      if (code[index - 1] !== code[index] &&
          FINGER[code[index - 1]] === FINGER[code[index]]) {
        differentKeySameFinger += row.weight;
      }
    }
  }
  for (const key of KEYS) load[key] /= strokes;
  const finger = Array(10).fill(0);
  for (const key of KEYS) finger[FINGER[key]] += load[key];
  const group = keys => [...keys].reduce((sum, key) => sum + load[key], 0);
  return {
    load,
    home: group(HOME),
    leftPinkyQAZ: group(LEFT_PINKY),
    rightPinky: group(RIGHT_PINKY),
    indexFingerTYB: group(TYB),
    maxFinger: Math.max(...finger),
    finger,
    differentKeySameFingerRate: differentKeySameFinger / transitionWeight,
  };
}

function loadSummary(outcomes) {
  const tracks = Object.fromEntries(Object.keys(TRACK_WEIGHTS).map(kind =>
    [kind, loadMetric(outcomes.filter(row => row.kind === kind))]));
  const peak = field => Object.entries(tracks).reduce((best, [track, metric]) =>
    !best || metric[field] > best.value ? {value: metric[field], track} : best, null);
  return {
    contract: "four native tone-in-main tracks; selected terminal codes include shape-only completion",
    tracks,
    homeS2: tracks.character.home,
    homeFloor4NativeTracks: Math.min(...Object.values(tracks).map(value => value.home)),
    leftPinkyQAZPeak4NativeTracks: peak("leftPinkyQAZ"),
    rightPinkyPeak4NativeTracks: peak("rightPinky"),
    maxFingerPeak4NativeTracks: peak("maxFinger"),
    indexFingerTYBPeak4NativeTracks: peak("indexFingerTYB"),
    s2DifferentKeySameFingerRate: tracks.character.differentKeySameFingerRate,
  };
}

function keyboardSemantics(fixture) {
  const firstByKey = Object.fromEntries([...KEYS].map(key => [key, []]));
  for (const atom of fixture.atoms) {
    const keys = new Set();
    for (const pinyin of atom.pinyin) for (const code of fixture.tonedCodes[pinyin]) {
      if (code) keys.add(code[0]);
    }
    for (const key of keys) firstByKey[key].push(atom.name);
  }
  const secondByKey = Object.fromEntries([...KEYS].map(key => [key, []]));
  const toneLabels = ["一", "二", "三", "四", "轻"];
  for (const atom of fixture.rhymeAtoms) for (let tone = 1; tone <= 5; tone++) {
    const keys = new Set(atom.pinyin.map(pinyin => fixture.tonedCodes[pinyin][tone - 1])
      .filter(Boolean).map(code => code[1]));
    for (const key of keys) secondByKey[key].push(`${atom.name}·${toneLabels[tone - 1]}`);
  }
  const shapeNames = ["折", "横", "撇", "竖", "点"];
  const shapeByKey = Object.fromEntries([...KEYS].map(key => [key, []]));
  const shapeKeysByMeaning = shapeKeysFromToneKeys(fixture.toneKeysByTone);
  if (shapeKeysByMeaning !== fixture.shapeKeysByMeaning) throw new Error('fixture auxiliary semantic round trip mismatch');
  [...shapeKeysByMeaning].forEach((key, index) => shapeByKey[key].push(shapeNames[index]));
  return {firstByKey, secondByKey, shapeByKey};
}

function filterRows(outcomes, fixture, data, words) {
  const readings = new Map(data.characters.map(row => [`c:${row[0]}:${row[1]}`, row]));
  return outcomes.map(outcome => {
    let indices, tones;
    if (outcome.kind === 'character') {
      const row = readings.get(outcome.id);
      indices = [row[1]]; tones = [row[2]];
    } else {
      const item = words[outcome.kind][Number(outcome.id.split(':')[1])];
      indices = item.py; tones = item.tones;
    }
    const codes = indices.map((py, index) => fixture.tonedCodes[py][tones[index] - 1]);
    const main = codes.map(code => outcome.kind === 'word3' || outcome.kind === 'word4' ? code[0] : code).join('');
    const reading = indices.map((py, index) => data.pinyin[py] + (tones[index] === 5 ? 0 : tones[index])).join(' ');
    return [outcome.text, reading, main, outcome.code, outcome.weight, outcome.kind];
  });
}

function ordinaryOnsetDiagnostics(fixture) {
  const byInitial = new Map();
  for (const atom of fixture.atoms) {
    if (!/^[bpmfdtnlgkhjqxrzcs]$/.test(atom.initial)) continue;
    if (!byInitial.has(atom.initial)) byInitial.set(atom.initial, new Set());
    for (const py of atom.pinyin) for (const code of fixture.tonedCodes[py]) {
      if (code) byInitial.get(atom.initial).add(code[0]);
    }
  }
  return {
    D: [...byInitial].filter(([initial, keys]) => [...keys].some(k => k !== initial.toUpperCase())).length,
    F: [...byInitial.values()].reduce((sum, keys) => sum + Math.max(0, keys.size - 1), 0),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, "..");
  const html = path.resolve(args.html || path.join(root, "a7_CKT_R11.html"));
  const snow = path.resolve(args.snow || "D:/C2D/Documents/rime-snow-pinyin");
  const fixturePath = path.resolve(args.fixture || path.join(
    root, "research/.cache/ckt-v51-toned-mars10-D1-final.json"));
  const output = path.resolve(args.output || path.join(
    root, "a7_CKT_R11_integrated_materials/snow_jiandao_toned_native.json"));
  const data = scorer.loadPayload(html);
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const {layout, inventory} = fixtureAdapter(fixture, data);
  const words = scorer.multiwords(path.join(snow, "snow_pinyin.base.dict.yaml"), data, 0.99);
  const strokes = scorer.strokeOptions(path.join(snow, "rime-stroke/stroke.dict.yaml"));
  const motor = toned.projectedMotor(data);
  const reference51 = toned.buildReference({data, words, strokes, motor, snow});
  const v51 = toned.evaluateLayoutPolicy({
    layout, layouts: inventory, data, words, motor, reference: reference51,
    shapeKeysByMeaning: fixture.shapeKeysByMeaning,
    policy: V51_POLICY,
  });
  const reference5 = v5Reference({data, words, strokes, motor, snow});
  const v5 = evaluateV5({
    layout, inventory, data, words, motor, reference: reference5,
    shapeKeysByMeaning: fixture.shapeKeysByMeaning,
  });
  if (Math.abs(v51.score - fixture.expected.score) > 1e-10) {
    throw new Error(`fixture v5.1 mismatch: ${v51.score} != ${fixture.expected.score}`);
  }
  const occupied = new Set(fixture.tonedCodes.flat().filter(Boolean));
  const outputData = {
    version: "snow-jiandao-toned-r11-native-benchmark-v1",
    id: fixture.publication?.id || "SNOW-JIANDAO-TONED",
    name: fixture.publication?.name || "冰雪剑道",
    publication: fixture.publication,
    layoutId: fixture.layoutId,
    contract: {
      main: "tone-in-main 21x21",
      completion: "shape-only AVUIO",
      shapeKeysByMeaning: fixture.shapeKeysByMeaning,
      toneKeysByTone: fixture.toneKeysByTone,
      toneDigitsByShapeMeaning: "42310",
      wordAuxiliaryPolicy: V51_POLICY,
      oldR11IndependentToneAuxiliary: false,
    },
    memory: {
      definition: fixture.publication?.memoryDefinition || "M-T1: baseline rule links plus one ordinary-initial displacement",
      lower: fixture.publication?.memoryAudit?.memoryLower ?? fixture.baselineMemoryLower + 1,
      guard: fixture.publication?.memoryAudit?.memoryGuard ?? fixture.baselineMemoryGuard + 1,
      audit: fixture.publication?.memoryAudit,
      ...ordinaryOnsetDiagnostics(fixture),
      onsetDefinition: "ordinary written initials; D counts displaced initials, F counts additional first-key incidences; derived from actual toned codes",
    },
    inventory: {
      legalTonedSyllables: fixture.tonedCodes.flat().filter(Boolean).length,
      occupiedBuckets: occupied.size,
      capacity: 441,
      emptyBuckets: 441 - occupied.size,
      qzEmpty: !occupied.has("QZ"),
      zqEmpty: !occupied.has("ZQ"),
    },
    keyboards: {
      soundKeys: fixture.soundKeys,
      ...keyboardSemantics(fixture),
    },
    tonedCodes: fixture.tonedCodes,
    filterRowColumns: ['text', 'readingWithTone0', 'mainCode', 'terminalCode', 'weight', 'kind'],
    filterRows: filterRows(v51.outcomes, fixture, data, words),
    ckt: {
      v5: {
        score: v5.score,
        policy: V5_POLICY,
        reference: "S005 keytao-only; same four tone-aware cohorts; two shape stages",
        tracks: v5.tracks,
      },
      v51: {
        score: v51.score,
        policy: V51_POLICY,
        reference: "S005 keytao-only; same four tone-aware cohorts; word3 permits third shape stage",
        tracks: v51.tracks,
      },
      aggregateV51: weightedAggregate(v51.tracks, [
        "motorUpperMs", "firstAuxRate", "secondAuxRate", "thirdAuxRate",
        "selectionRate", "meanRejectedCandidates", "meanPageActions", "meanKeys",
        "effectiveMs",
      ]),
    },
    ergonomics: loadSummary(v51.outcomes),
  };
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(outputData, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    output, cktV5: outputData.ckt.v5.score, cktV51: outputData.ckt.v51.score,
    occupied: outputData.inventory.occupiedBuckets,
  })}\n`);
}

if (require.main === module) main();

module.exports = {fixtureAdapter, keyboardSemantics, loadMetric, loadSummary,
  evaluateV5, v5Reference, weightedAggregate, ordinaryOnsetDiagnostics, filterRows};
