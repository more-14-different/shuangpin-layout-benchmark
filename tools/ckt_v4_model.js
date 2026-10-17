'use strict';

/*
 * CKT v4 competition and aggregation kernel.
 *
 * The kernel deliberately knows nothing about Pinyin or a particular keyboard.
 * A corpus adapter supplies rows and exact physical codes.  This separation is
 * important: routing/candidate competition can be tested without the large HTML
 * payload, and a newer upstream motor table can be swapped in independently.
 */

const KINDS = ['character', 'word2', 'word3', 'word4'];
const DEFAULT_KIND_WEIGHTS = Object.freeze({
  character: 1,
  word2: 3,
  word3: 1,
  word4: 1,
});

const HISTORICAL_COGNITIVE_PRIOR = Object.freeze({
  firstAuxMs: 300,
  secondAuxMs: 300,
  selectionDecisionMs: 600,
  scanPerCandidateMs: 0,
  selectionActionMs: 0,
  pageSize: 9,
  pageActionMs: 0,
});

// Engineering prior for the rank-aware v4 scenario.  The non-zero scan/page
// coefficients are deliberately exposed parameters, not human-performance
// measurements; keep the historical 300/300/600 prior above for replay.
const DEFAULT_COGNITIVE_PRIOR = Object.freeze({
  ...HISTORICAL_COGNITIVE_PRIOR,
  scanPerCandidateMs: 50,
  pageActionMs: 300,
});

function float32Table(spec) {
  const bytes = Buffer.from(spec.base64, 'base64');
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function upstreamMotor(snapshot, options = {}) {
  const keys = snapshot.keys;
  const size = [...keys].length;
  const index = Object.fromEntries([...keys].map((key, i) => [key, i]));
  const tables = Object.fromEntries(snapshot.roles.map(role => [role, float32Table(snapshot.tables[role])]));
  const continuationGuardMs = Number(options.continuationGuardMs || 0);
  function at(role, values) {
    let offset = 0;
    for (const value of values) offset = offset * size + value;
    return tables[role][offset];
  }
  return code => {
    const values = [...code].map(key => index[key]);
    if (values.length < 2 || values.some(value => value === undefined)) return null;
    let upperMs;
    let exact = true;
    if (values.length === 2) upperMs = at('L2i1', values);
    else if (values.length === 3) upperMs = at('L3i1', values) + at('L3i2', values);
    else {
      upperMs = at('L4i1', values.slice(0, 3)) + at('L4i3', values.slice(-3));
      for (let i = 0; i <= values.length - 4; i++) upperMs += at('L4i2', values.slice(i, i + 4));
      if (values.length > 4) {
        exact = false;
        upperMs += (values.length - 4) * continuationGuardMs;
      }
    }
    return {upperMs, exact, codeLength: values.length, upstreamCommit: snapshot.commit};
  };
}

function projectedMotor(nativeMotor, nativeKeys, extensionMaps) {
  const native = new Set([...nativeKeys]);
  const cache = new Map();
  return code => {
    if (cache.has(code)) return cache.get(code);
    let variants = [{code: '', weight: 1}];
    let guard = 1;
    let projected = false;
    for (const key of code) {
      if (native.has(key)) {
        variants = variants.map(item => ({...item, code: item.code + key}));
        continue;
      }
      const extension = extensionMaps[key];
      if (!extension) {
        cache.set(code, null);
        return null;
      }
      projected = true;
      guard = Math.max(guard, Number(extension.distance_guard_multiplier || 1));
      variants = variants.flatMap(item => Object.entries(extension.donors).map(([donor, weight]) => ({
        code: item.code + donor,
        weight: item.weight * weight,
      })));
    }
    let upperMs = 0;
    let exact = !projected;
    for (const variant of variants) {
      const value = nativeMotor(variant.code);
      if (!value) continue;
      upperMs += variant.weight * value.upperMs;
      exact &&= value.exact;
    }
    const value = {upperMs: upperMs * guard, exact, projected, extensionGuard: guard};
    cache.set(code, value);
    return value;
  };
}

function classifyContract(capacity) {
  if (!Array.isArray(capacity) || capacity.length < 2) {
    throw new TypeError('capacity must be a two-element array');
  }
  return Number(capacity[0]) === 21 && Number(capacity[1]) === 21
    ? 'traditional-21x21'
    : 'four-code-top';
}

function stagePools(contract, kind) {
  if (!KINDS.includes(kind)) throw new Error(`unknown kind: ${kind}`);
  if (kind === 'character') return ['char:base', 'char:aux1', 'char:aux2'];
  if (kind === 'word2') return ['word:four', 'word:five', 'word:six'];
  if (kind === 'word4') return ['word:four', 'word:five', 'word:six'];
  if (contract === 'traditional-21x21') {
    return ['word3:three', 'word3:four-b', 'word3:five-bb'];
  }
  if (contract === 'four-code-top') {
    return ['word3:three', 'word:four', 'word:five', 'word:six'];
  }
  throw new Error(`unknown contract: ${contract}`);
}

function makeStages(contract, kind, codesByStage) {
  const pools = stagePools(contract, kind);
  if (!Array.isArray(codesByStage) || codesByStage.length !== pools.length) {
    throw new Error(`${contract}/${kind}: expected ${pools.length} code stages`);
  }
  return codesByStage.map((stage, index) => {
    const length = Number(stage.length);
    const codes = [...new Set(stage.codes || [])].filter(Boolean).sort();
    if (!Number.isInteger(length) || length < 1 || !codes.length) {
      throw new Error(`${contract}/${kind}: invalid stage ${index}`);
    }
    if (codes.some(code => [...code].length !== length)) {
      throw new Error(`${contract}/${kind}: code length disagrees at stage ${index}`);
    }
    return {order: length, length, pool: pools[index], codes};
  });
}

function compareRows(a, b) {
  const aw = Number(a.weight) || 0;
  const bw = Number(b.weight) || 0;
  if (aw !== bw) return bw - aw;
  // Equal corpus weights carry no evidence for a locale-dependent candidate
  // order.  Keep the adapter's stable IDs as the deterministic final tie-break.
  const ai = String(a.id);
  const bi = String(b.id);
  return ai < bi ? -1 : ai > bi ? 1 : 0;
}

function validateRows(rows) {
  const ids = new Set();
  for (const row of rows) {
    if (!row || row.id === undefined || ids.has(row.id)) {
      throw new Error(`row ids must be present and unique: ${row?.id}`);
    }
    ids.add(row.id);
    if (!KINDS.includes(row.kind)) throw new Error(`unknown row kind: ${row.kind}`);
    if (!(Number(row.weight) > 0)) throw new Error(`invalid row weight: ${row.id}`);
    if (!Number.isInteger(row.baseLength) || row.baseLength < 1) {
      throw new Error(`invalid baseLength: ${row.id}`);
    }
    if (!Array.isArray(row.stages) || !row.stages.length) {
      throw new Error(`row has no stages: ${row.id}`);
    }
    let priorOrder = -Infinity;
    for (const stage of row.stages) {
      if (!stage.pool || !Array.isArray(stage.codes) || !stage.codes.length) {
        throw new Error(`invalid stage: ${row.id}`);
      }
      if (stage.order <= priorOrder) throw new Error(`stages must increase: ${row.id}`);
      priorOrder = stage.order;
    }
  }
}

function rankBuckets(active, order) {
  const buckets = new Map();
  for (const state of active) {
    const stage = state.row.stages[state.stageIndex];
    if (!stage || stage.order !== order) continue;
    for (const code of stage.codes) {
      const key = `${stage.pool}\u0000${code}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(state.row);
    }
  }
  for (const [key, rows] of buckets) {
    rows.sort(compareRows);
    buckets.set(key, new Map(rows.map((row, index) => [row.id, index + 1])));
  }
  return buckets;
}

function bestRank(row, stage, buckets) {
  let best = Infinity;
  let bestCodes = [];
  for (const code of stage.codes) {
    const bucket = buckets.get(`${stage.pool}\u0000${code}`);
    const rank = bucket?.get(row.id) || 0;
    if (!rank) continue;
    if (rank < best) {
      best = rank;
      bestCodes = [code];
    } else if (rank === best) {
      bestCodes.push(code);
    }
  }
  return {rank: best, codes: bestCodes};
}

/**
 * Resolve an IME routing graph stage by stage.  Early winners are removed before
 * the next stage.  This is what makes AAA winners absent from the non-21x21 AAAU
 * pool while residual three-character words compete with AUAU and AAAA.
 */
function resolveCompetition(rows, options = {}) {
  validateRows(rows);
  const motorCost = options.motorCost || (code => ({upperMs: [...code].length}));
  let active = rows.map(row => ({row, stageIndex: 0}));
  const outcomes = new Map();
  const orders = [...new Set(rows.flatMap(row => row.stages.map(stage => stage.order)))].sort((a, b) => a - b);

  for (const order of orders) {
    const buckets = rankBuckets(active, order);
    const nextActive = [];
    for (const state of active) {
      const stage = state.row.stages[state.stageIndex];
      if (!stage || stage.order !== order) {
        nextActive.push(state);
        continue;
      }
      const ranked = bestRank(state.row, stage, buckets);
      const terminal = state.stageIndex === state.row.stages.length - 1;
      if (ranked.rank === 1 || terminal) {
        let chosen = null;
        let chosenMotor = null;
        for (const code of ranked.codes) {
          const value = motorCost(code, stage, state.row);
          const upperMs = typeof value === 'number' ? value : value?.upperMs;
          if (!Number.isFinite(upperMs)) continue;
          if (!chosenMotor || upperMs < chosenMotor.upperMs || (upperMs === chosenMotor.upperMs && code < chosen)) {
            chosen = code;
            chosenMotor = typeof value === 'number' ? {upperMs: value} : value;
          }
        }
        if (!chosenMotor) throw new Error(`no motor cost for ${state.row.id}`);
        outcomes.set(state.row.id, {
          id: state.row.id,
          text: state.row.text,
          kind: state.row.kind,
          weight: state.row.weight,
          baseLength: state.row.baseLength,
          code: chosen,
          codeLength: stage.length,
          auxCount: Math.max(0, stage.length - state.row.baseLength),
          rank: ranked.rank,
          pool: stage.pool,
          motorUpperMs: chosenMotor.upperMs,
          motor: chosenMotor,
        });
      } else {
        state.stageIndex += 1;
        nextActive.push(state);
      }
    }
    active = nextActive;
  }
  if (active.length) throw new Error(`unresolved rows: ${active.map(x => x.row.id).join(', ')}`);
  return rows.map(row => outcomes.get(row.id));
}

function selectionKeystrokes(rank, pageSize) {
  if (rank <= 1) return {pages: 0, selections: 0};
  const safePage = Math.max(2, Math.floor(pageSize || 9));
  return {pages: Math.floor((rank - 1) / safePage), selections: 1};
}

function cognitiveCost(outcome, parameters = DEFAULT_COGNITIVE_PRIOR) {
  const p = {...DEFAULT_COGNITIVE_PRIOR, ...parameters};
  const first = outcome.auxCount >= 1 ? p.firstAuxMs : 0;
  const second = outcome.auxCount >= 2 ? p.secondAuxMs : 0;
  const {pages, selections} = selectionKeystrokes(outcome.rank, p.pageSize);
  // Every higher-ranked candidate must be rejected before the target.  Page
  // actions are accounted independently, so later pages retain both the
  // serial visual-search slope and a discrete page-transition penalty.
  const inspected = outcome.rank > 1 ? outcome.rank - 1 : 0;
  const selection = outcome.rank > 1
    ? p.selectionDecisionMs + inspected * p.scanPerCandidateMs
      + selections * p.selectionActionMs + pages * p.pageActionMs
    : 0;
  return {firstAuxMs: first, secondAuxMs: second, selectionMs: selection, totalMs: first + second + selection};
}

function summarizeOutcomes(outcomes, parameters = DEFAULT_COGNITIVE_PRIOR) {
  const p = {...DEFAULT_COGNITIVE_PRIOR, ...parameters};
  const result = {};
  for (const kind of KINDS) {
    const selected = outcomes.filter(row => row.kind === kind);
    const totalWeight = selected.reduce((sum, row) => sum + row.weight, 0);
    if (!totalWeight) {
      result[kind] = null;
      continue;
    }
    let motor = 0;
    let cognitive = 0;
    let aux1 = 0;
    let aux2 = 0;
    let selectedWeight = 0;
    let rankWeighted = 0;
    let rejectedCandidates = 0;
    let pageActions = 0;
    let codeLength = 0;
    for (const row of selected) {
      const cog = cognitiveCost(row, parameters);
      motor += row.weight * row.motorUpperMs;
      cognitive += row.weight * cog.totalMs;
      if (row.auxCount >= 1) aux1 += row.weight;
      if (row.auxCount >= 2) aux2 += row.weight;
      if (row.rank > 1) selectedWeight += row.weight;
      rankWeighted += row.weight * row.rank;
      rejectedCandidates += row.weight * Math.max(0, row.rank - 1);
      pageActions += row.weight * selectionKeystrokes(row.rank, p.pageSize).pages;
      codeLength += row.weight * row.codeLength;
    }
    result[kind] = {
      count: selected.length,
      totalWeight,
      motorUpperMs: motor / totalWeight,
      cognitiveMs: cognitive / totalWeight,
      effectiveMs: (motor + cognitive) / totalWeight,
      firstAuxRate: aux1 / totalWeight,
      secondAuxRate: aux2 / totalWeight,
      selectionRate: selectedWeight / totalWeight,
      meanTerminalRank: rankWeighted / totalWeight,
      meanRejectedCandidates: rejectedCandidates / totalWeight,
      meanPageActions: pageActions / totalWeight,
      meanKeys: codeLength / totalWeight,
    };
  }
  return result;
}

function compositeScore(candidateModes, referenceModes, options = {}) {
  const weights = {...DEFAULT_KIND_WEIGHTS, ...(options.kindWeights || {})};
  const power = Number(options.power ?? 4);
  const anchor = Number(options.anchor ?? 10);
  let total = 0;
  let weighted = 0;
  for (const mode of Object.keys(candidateModes).sort()) {
    if (!referenceModes[mode]) throw new Error(`reference is missing mode ${mode}`);
    for (const kind of KINDS) {
      const a = candidateModes[mode][kind]?.effectiveMs;
      const b = referenceModes[mode][kind]?.effectiveMs;
      const w = Number(weights[kind]) || 0;
      if (!(a > 0) || !(b > 0) || !(w > 0)) throw new Error(`invalid composite track ${mode}/${kind}`);
      weighted += w * (a / b) ** power;
      total += w;
    }
  }
  return anchor * (weighted / total) ** (1 / power);
}

module.exports = {
  KINDS,
  DEFAULT_KIND_WEIGHTS,
  HISTORICAL_COGNITIVE_PRIOR,
  DEFAULT_COGNITIVE_PRIOR,
  upstreamMotor,
  projectedMotor,
  classifyContract,
  stagePools,
  makeStages,
  resolveCompetition,
  selectionKeystrokes,
  cognitiveCost,
  summarizeOutcomes,
  compositeScore,
};
