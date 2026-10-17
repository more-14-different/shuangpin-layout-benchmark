import fs from 'node:fs';
import path from 'node:path';

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!flag?.startsWith('--') || value === undefined) throw new Error(`invalid argument near ${flag ?? '<end>'}`);
    result[flag.slice(2)] = value;
  }
  return result;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function effectiveMs(row, parameters) {
  return row.motorUpperMs
    + parameters.firstAuxMs * row.firstAuxRate
    + parameters.secondAuxMs * row.secondAuxRate
    + (parameters.selectionDecisionMs + parameters.selectionActionMs) * row.selectionRate
    + parameters.scanPerCandidateMs * (row.meanRejectedCandidates
      ?? Math.max(0, row.meanTerminalRank - 1))
    + parameters.pageActionMs * (row.meanPageActions ?? 0);
}

function compositeScore(modes, reference, parameters, kindWeights) {
  let weighted = 0;
  let total = 0;
  for (const mode of ['keytao', 'sanpin']) {
    for (const kind of ['character', 'word2', 'word3', 'word4']) {
      const weight = kindWeights[kind];
      const candidate = effectiveMs(modes[mode][kind], parameters);
      const baseline = effectiveMs(reference[mode][kind], parameters);
      if (!(candidate > 0 && baseline > 0 && weight > 0)) throw new Error(`invalid track ${mode}/${kind}`);
      weighted += weight * (candidate / baseline) ** 4;
      total += weight;
    }
  }
  return 10 * (weighted / total) ** 0.25;
}

function layoutSignature(scheme) {
  return JSON.stringify([scheme.capacity, scheme.tone, scheme.codeList]);
}

const args = parseArgs(process.argv.slice(2));
for (const name of ['results', 'capabilities', 'schemes', 'capacity', 'count', 'output']) {
  if (!args[name]) throw new Error(`--${name} is required`);
}
const capacity = args.capacity.split(',').map(Number);
const count = Number(args.count);
if (capacity.length !== 2 || capacity.some(value => !Number.isInteger(value) || value <= 0)) {
  throw new Error('--capacity must contain two positive integers');
}
if (!Number.isInteger(count) || count <= 0) throw new Error('--count must be a positive integer');

const results = readJson(args.results);
const capabilities = readJson(args.capabilities);
const fixture = readJson(args.schemes);
if (results.version !== 'completion-ckt-v4-rank-cognition-2') {
  throw new Error(`unsupported results version ${results.version}`);
}
const reference = results.schemes?.S005?.modes;
if (!reference) throw new Error('results do not contain the S005 anchor');
const parameters = results.cognitiveDefaults;
const kindWeights = results.aggregation?.kindWeights;
const capabilityById = new Map(capabilities.schemes.map(record => [record.id, record]));
const fixtureById = new Map(fixture.schemes.map(scheme => [scheme.id, scheme]));

const ranked = Object.entries(results.schemes)
  .filter(([id, scheme]) => scheme.capacity?.[0] === capacity[0]
    && scheme.capacity?.[1] === capacity[1]
    && capabilityById.get(id)?.forwardScore
    && capabilityById.get(id)?.regularAnneal
    && capabilityById.get(id)?.reasonCode === 'supported')
  .map(([id, scheme]) => {
    const input = fixtureById.get(id);
    if (!input) throw new Error(`eligible scheme ${id} is absent from the scheme fixture`);
    return {
      id,
      cktV4: compositeScore(scheme.modes, reference, parameters, kindWeights),
      contract: scheme.contract,
      signature: layoutSignature(input),
    };
  })
  .sort((left, right) => left.cktV4 - right.cktV4 || left.id.localeCompare(right.id));
if (ranked.length === 0) throw new Error(`no eligible ${args.capacity} schemes`);

const selected = [];
const selectedSignatures = new Map();
const ranking = ranked.map((entry, index) => {
  const duplicateOf = selectedSignatures.get(entry.signature) ?? null;
  const isSelected = selected.length < count && duplicateOf === null;
  if (isSelected) {
    selected.push({rank: index + 1, id: entry.id, cktV4: entry.cktV4, contract: entry.contract});
    selectedSignatures.set(entry.signature, entry.id);
  }
  return {
    rank: index + 1,
    id: entry.id,
    cktV4: entry.cktV4,
    contract: entry.contract,
    selected: isSelected,
    ...(duplicateOf ? {duplicateOf} : {}),
  };
});
if (selected.length !== count) throw new Error(`only ${selected.length} unique eligible layouts; requested ${count}`);
const anchor = compositeScore(reference, reference, parameters, kindWeights);
if (Math.abs(anchor - 10) > 1e-12) throw new Error(`S005 anchor drifted to ${anchor}`);

const output = {
  version: 'ckt-v4-ranked-explorer-seeds-1',
  capacity,
  anchor: {id: 'S005', cktV4: anchor},
  eligibility: {
    forwardScore: true,
    regularAnneal: true,
    reasonCode: 'supported',
    exactLayoutDuplicatesRemovedFromSelection: true,
  },
  sources: {
    results: path.normalize(args.results),
    capabilities: path.normalize(args.capabilities),
    schemes: path.normalize(args.schemes),
  },
  eligibleCount: ranking.length,
  selected,
  ranking,
};
fs.mkdirSync(path.dirname(args.output), {recursive: true});
fs.writeFileSync(args.output, `${JSON.stringify(output, null, 2)}\n`);
console.error(`selected ${selected.length} of ${ranking.length} eligible ${args.capacity} layouts; best=${selected[0].id} ${selected[0].cktV4.toFixed(9)}`);
