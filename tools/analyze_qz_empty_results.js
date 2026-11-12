#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const UNCONSTRAINED_CHAMPION_SCORE = 9.203609845305;
const MARS0_BASELINE_SCORE = 9.556530457331402;
const TRADITIONAL_INITIALS = Object.freeze([
  'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's',
]);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    args[key] = val;
  }
  return args;
}

function buildStateDetails(state, fixture, auditSet) {
  const firstKeys = state.firstKeys;
  const rhymeKeys = state.rhymeKeys;
  const atomByPy = new Map();
  fixture.atoms.forEach((atom, idx) => {
    for (const py of atom.pinyin) atomByPy.set(py, idx);
  });
  const rhymeByPy = new Map();
  fixture.rhymeAtoms.forEach((rhyme, idx) => {
    for (const py of rhyme.pinyin) rhymeByPy.set(py, idx);
  });
  const toneToRegion = new Map();
  fixture.toneRegions.forEach((region, idx) => {
    for (const tone of region.tones) toneToRegion.set(tone, idx);
  });

  const tokenKeys = [];
  const tonedCodes = [];
  const qzSyllables1407 = [];
  const zqSyllables1407 = [];
  const occupied1407 = new Set();
  const occupied1237 = new Set();

  for (let py = 0; py < fixture.pinyin.length; py++) {
    for (let t = 0; t < 5; t++) {
      if (!fixture.tonedCodes[py][t]) continue;
      const tone = t + 1;
      const token = `${fixture.pinyin[py]}${tone}`;
      const atomIdx = atomByPy.get(py);
      const rhymeIdx = rhymeByPy.get(py);
      const regionIdx = toneToRegion.get(tone);
      const code = `${firstKeys[atomIdx]}${rhymeKeys[regionIdx][rhymeIdx]}`;
      tokenKeys.push(token);
      tonedCodes.push(code);
      occupied1407.add(code);
      if (auditSet.has(token)) occupied1237.add(code);
      if (code === 'QZ') qzSyllables1407.push(token);
      if (code === 'ZQ') zqSyllables1407.push(token);
    }
  }

  const soundKeys = [...fixture.soundKeys];
  const empty1407 = [];
  const empty1237 = [];
  for (const c1 of soundKeys) {
    for (const c2 of soundKeys) {
      const b = `${c1}${c2}`;
      if (!occupied1407.has(b)) empty1407.push(b);
      if (!occupied1237.has(b)) empty1237.push(b);
    }
  }

  // Ordinary D/F (new convention: single-letter ordinary initials only)
  const ordinaryMoved = [];
  let ordinaryD = 0;
  let ordinaryF = 0;
  fixture.atoms.forEach((atom, i) => {
    if (atom.initial.length === 1 && atom.initial !== '_') {
      if (firstKeys[i] !== atom.baselineKey) {
        ordinaryD++;
        ordinaryMoved.push(`${atom.name}:${atom.baselineKey}->${firstKeys[i]}`);
      }
      if (!soundKeys.includes(firstKeys[i])) ordinaryF++;
    }
  });

  // Historical folded D/F (legacy-folded: zh->z, ch->c, sh->s)
  const baselineInitialMap = {};
  fixture.atoms.forEach((atom) => {
    if (atom.initial.length === 1 && atom.initial !== '_') {
      baselineInitialMap[atom.initial] = atom.baselineKey;
    }
  });
  const foldedIncidences = new Map(TRADITIONAL_INITIALS.map((init) => [init, new Set()]));
  fixture.atoms.forEach((atom, i) => {
    const ch = atom.initial[0];
    if (foldedIncidences.has(ch)) foldedIncidences.get(ch).add(firstKeys[i]);
  });
  const legacyFoldedD = [...foldedIncidences].filter(([init, keys]) =>
    [...keys].some((k) => k !== baselineInitialMap[init])).length;
  const legacyFoldedF = [...foldedIncidences.values()]
    .reduce((sum, keys) => sum + Math.max(0, keys.size - 1), 0);

  // Move counts and Memory M_lower / M_guard
  let firstMemoryDelta = 0;
  let firstGroupMoves = 0;
  let specialFirstMoves = 0;
  const specialMoved = [];
  fixture.atoms.forEach((atom, i) => {
    if (firstKeys[i] !== atom.baselineKey) {
      firstMemoryDelta += atom.moveMemoryDelta;
      firstGroupMoves++;
      if (fixture.searchableFirstAtoms.includes(atom.name)) {
        specialFirstMoves++;
        specialMoved.push(`${atom.name}:${atom.baselineKey}->${firstKeys[i]}`);
      }
    }
  });

  let mergeLower = 0;
  let rhymeGroupMoves = 0;
  const toneRegionRhymeKeys = {};
  fixture.toneRegions.forEach((region, regIdx) => {
    const uniq = new Set(rhymeKeys[regIdx]);
    mergeLower += fixture.rhymeAtoms.length - uniq.size;
    toneRegionRhymeKeys[region.name] = {};
    fixture.rhymeAtoms.forEach((rhyme, rhymeIdx) => {
      const k = rhymeKeys[regIdx][rhymeIdx];
      toneRegionRhymeKeys[region.name][rhyme.name] = k;
      if (k !== rhyme.baselineKeys[region.name]) rhymeGroupMoves++;
    });
  });

  const mergeDelta = mergeLower - fixture.baselineToneRegionMergeLower;
  const memoryLower = fixture.baselineMemoryLower + firstMemoryDelta + mergeDelta;
  const memoryGuard = fixture.baselineMemoryGuard + firstMemoryDelta + mergeDelta;

  const firstKeyMap = {};
  fixture.atoms.forEach((atom, i) => {
    firstKeyMap[atom.name] = firstKeys[i];
  });

  return {
    tokenKeys,
    tonedCodes,
    qzEmpty: qzSyllables1407.length === 0,
    zqEmpty: zqSyllables1407.length === 0,
    qzSyllables1407,
    zqSyllables1407,
    occupied1407Set: occupied1407,
    occupiedBuckets1407: occupied1407.size,
    emptyBuckets1407Count: empty1407.length,
    emptyBuckets1407: empty1407,
    occupiedBuckets1237: occupied1237.size,
    emptyBuckets1237Count: empty1237.length,
    emptyBuckets1237: empty1237,
    ordinaryD,
    ordinaryF,
    legacyFoldedD,
    legacyFoldedF,
    memoryLower,
    memoryGuard,
    mergeLower,
    firstGroupMoves,
    specialFirstMoves,
    rhymeGroupMoves,
    rhymeInternalSplits: 0,
    ordinaryMoved,
    specialMoved,
    firstKeyMap,
    toneRegionRhymeKeys,
  };
}

function stateKey(state) {
  return `${state.firstKeys.join('')}|${state.rhymeKeys.map((r) => r.join('')).join(',')}`;
}

function dominates(a, b) {
  return (
    a.details.ordinaryD <= b.details.ordinaryD &&
    a.details.memoryLower <= b.details.memoryLower &&
    a.score <= b.score &&
    (a.details.ordinaryD < b.details.ordinaryD ||
      a.details.memoryLower < b.details.memoryLower ||
      a.score < b.score)
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, '..');
  const fixturePath = path.resolve(
    args.fixture || path.join(root, 'research/.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json')
  );
  const seedsPath = path.resolve(
    args['seeds-json'] || path.join(root, 'research/config/ckt-v51-toned-2121-seeds.json')
  );
  const templatePath = path.resolve(
    args.template ||
      path.join(root, 'research/config/ckt-v51-toned-2121-marsfirst-zh-e-mars10-uneven786-finalist.json')
  );
  const resultFiles = String(args.results || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const requireEmpty = String(args['require-empty'] || 'QZ')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const idPrefix = String(
    args['id-prefix'] || (requireEmpty.includes('ZQ') ? 'MARS10-QZZQEMPTY' : 'MARS10-QZEMPTY')
  );
  const factorizationLabel = String(
    args.factorization ||
      (requireEmpty.includes('ZQ') ? 'mars10-avuio786-qzzq-empty' : 'mars10-avuio786-qz-empty')
  );

  if (resultFiles.length === 0) {
    throw new Error('pass --results file1.json,file2.json,...');
  }

  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const seeds = JSON.parse(fs.readFileSync(seedsPath, 'utf8'));
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  const auditSet = new Set(seeds.auditTokenKeys);

  const runSummaries = [];
  const allCandidates = new Map();

  const registerCandidate = (score, state, sourceTag) => {
    const key = stateKey(state);
    const details = buildStateDetails(state, fixture, auditSet);
    for (const bucket of requireEmpty) {
      if (details.occupied1407Set.has(bucket)) {
        throw new Error(`Candidate from ${sourceTag} violates ${bucket}=empty!`);
      }
    }
    const prev = allCandidates.get(key);
    if (!prev || score < prev.score) {
      allCandidates.set(key, {
        score,
        state,
        sourceTag,
        details,
      });
    }
  };

  for (const relPath of resultFiles) {
    const fullPath = path.resolve(root, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Missing result file: ${fullPath}`);
    }
    const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    const label = path.basename(fullPath, '.json');
    const bestDetails = buildStateDetails(data.bestState, fixture, auditSet);

    runSummaries.push({
      file: relPath,
      label,
      version: data.version,
      maxD: data.maxD,
      rhymeOnly: data.rhymeOnly,
      steps: data.step,
      totalSteps: data.totalSteps,
      evaluated: data.evaluated,
      accepted: data.accepted,
      rejectedForbidden: data.rejectedForbidden || 0,
      elapsedSeconds: Number(((data.elapsedMs || 0) / 1000).toFixed(2)),
      baseScore: data.baseScore,
      bestScore: data.bestScore,
      deltaUnconstrainedChampion: data.bestScore - UNCONSTRAINED_CHAMPION_SCORE,
      deltaMars0Baseline: data.bestScore - MARS0_BASELINE_SCORE,
      ordinaryD: bestDetails.ordinaryD,
      ordinaryF: bestDetails.ordinaryF,
      legacyFoldedD: bestDetails.legacyFoldedD,
      legacyFoldedF: bestDetails.legacyFoldedF,
      memoryLower: bestDetails.memoryLower,
      memoryGuard: bestDetails.memoryGuard,
      firstGroupMoves: bestDetails.firstGroupMoves,
      specialFirstMoves: bestDetails.specialFirstMoves,
      rhymeGroupMoves: bestDetails.rhymeGroupMoves,
      rhymeInternalSplits: bestDetails.rhymeInternalSplits,
      occupiedBuckets1407: bestDetails.occupiedBuckets1407,
      emptyBuckets1407Count: bestDetails.emptyBuckets1407Count,
      occupiedBuckets1237: bestDetails.occupiedBuckets1237,
      emptyBuckets1237Count: bestDetails.emptyBuckets1237Count,
      qzEmpty: bestDetails.qzEmpty,
      zqEmpty: bestDetails.zqEmpty,
      ordinaryMoved: bestDetails.ordinaryMoved,
      specialMoved: bestDetails.specialMoved,
      paretoCount: (data.paretoFrontier || []).length,
    });

    registerCandidate(data.bestScore, data.bestState, `${label}:best`);
    for (const entry of data.paretoFrontier || []) {
      registerCandidate(entry.score, entry.state, `${label}:pareto(step=${entry.step})`);
    }
  }

  // Compute strict global Pareto frontier over (CKT, M_lower, ordinaryD)
  const pool = [...allCandidates.values()];
  const pareto = pool
    .filter((cand) => !pool.some((other) => other !== cand && dominates(other, cand)))
    .sort((a, b) =>
      a.details.ordinaryD - b.details.ordinaryD ||
      a.details.memoryLower - b.details.memoryLower ||
      a.score - b.score
    );

  // Deduplicate exact ties on same (D, M) if within 1e-12
  const cleanPareto = [];
  for (const item of pareto) {
    const dup = cleanPareto.find(
      (x) =>
        x.details.ordinaryD === item.details.ordinaryD &&
        x.details.memoryLower === item.details.memoryLower &&
        Math.abs(x.score - item.score) < 1e-12
    );
    if (!dup) cleanPareto.push(item);
  }

  const globalBest = [...pool].sort((a, b) => a.score - b.score)[0];

  const outputFinalist = path.resolve(
    args['output-finalist'] || path.join(root, 'research/config/ckt-v51-toned-2121-mars10-qz-empty-finalist.json')
  );
  const outputSummary = path.resolve(
    args['output-summary'] || path.join(root, 'research/notes/2026-11-12-ckt-v51-toned-2121-mars10-qz-empty-results.json')
  );

  const finalistLayouts = cleanPareto.map((item, idx) => {
    const d = item.details;
    const id = `${idPrefix}-D${d.ordinaryD}-M${d.memoryLower}-${String(idx + 1).padStart(2, '0')}`;
    return {
      id,
      factorization: factorizationLabel,
      origin: item.sourceTag,
      rustScore: item.score,
      deltaUnconstrainedChampion: item.score - UNCONSTRAINED_CHAMPION_SCORE,
      deltaMars0Baseline: item.score - MARS0_BASELINE_SCORE,
      firstKeys: d.firstKeyMap,
      ordinaryMoved: d.ordinaryMoved,
      specialMoved: d.specialMoved,
      toneRegionRhymeKeys: d.toneRegionRhymeKeys,
      memoryAudit: {
        memoryLower: d.memoryLower,
        memoryGuard: d.memoryGuard,
        toneRegionMergeLower: d.mergeLower,
        ordinaryD: d.ordinaryD,
        ordinaryF: d.ordinaryF,
        legacyFoldedD: d.legacyFoldedD,
        legacyFoldedF: d.legacyFoldedF,
        firstGroupMoves: d.firstGroupMoves,
        specialFirstMoves: d.specialFirstMoves,
        rhymeGroupMoves: d.rhymeGroupMoves,
        rhymeInternalSplits: d.rhymeInternalSplits,
      },
      bucketAudit: {
        requireEmptyBuckets: requireEmpty,
        qzEmpty: d.qzEmpty,
        zqEmpty: d.zqEmpty,
        qzSyllables1407: d.qzSyllables1407,
        zqSyllables1407: d.zqSyllables1407,
        layout1407OccupiedBuckets: d.occupiedBuckets1407,
        layout1407EmptyBucketsCount: d.emptyBuckets1407Count,
        layout1407EmptyBuckets: d.emptyBuckets1407,
        common1237OccupiedBuckets: d.occupiedBuckets1237,
        common1237EmptyBucketsCount: d.emptyBuckets1237Count,
        common1237EmptyBuckets: d.emptyBuckets1237,
      },
      tonedCodes: d.tonedCodes,
    };
  });

  const finalistJson = {
    version: 'ckt-v51-toned-2121-mars10-qz-empty-finalist-1',
    purpose: `AVUIO 7:8:6 Mars 10 rhyme groups with ${requireEmpty.join('+')}=empty hard constraint across 1,407 legal syllables`,
    contract: {
      ...template.contract,
      requireEmptyBuckets: requireEmpty,
      rhymeInternalSplits: 0,
      policy: { word2: '12', word3: '213', word4: '24' },
    },
    toneProfile: template.toneProfile,
    factorization: template.factorization,
    referenceScores: {
      unconstrainedChampion: UNCONSTRAINED_CHAMPION_SCORE,
      mars0Baseline: MARS0_BASELINE_SCORE,
    },
    tokenKeys: globalBest.details.tokenKeys,
    layouts: finalistLayouts,
  };

  fs.mkdirSync(path.dirname(outputFinalist), { recursive: true });
  fs.writeFileSync(outputFinalist, `${JSON.stringify(finalistJson, null, 2)}\n`, 'utf8');

  const summaryJson = {
    version: 'ckt-v51-toned-2121-mars10-qz-empty-summary-1',
    referenceScores: {
      unconstrainedChampion: UNCONSTRAINED_CHAMPION_SCORE,
      mars0Baseline: MARS0_BASELINE_SCORE,
    },
    globalBestScore: globalBest.score,
    globalBestDeltaChampion: globalBest.score - UNCONSTRAINED_CHAMPION_SCORE,
    globalBestDeltaMars0: globalBest.score - MARS0_BASELINE_SCORE,
    runSummaries,
    paretoFrontier: finalistLayouts.map(({ tonedCodes, ...rest }) => rest),
  };

  fs.mkdirSync(path.dirname(outputSummary), { recursive: true });
  fs.writeFileSync(outputSummary, `${JSON.stringify(summaryJson, null, 2)}\n`, 'utf8');

  process.stdout.write(`Exported ${finalistLayouts.length} Pareto finalists to ${outputFinalist}\n`);
  process.stdout.write(`Exported run summaries to ${outputSummary}\n`);
}

if (require.main === module) main();
