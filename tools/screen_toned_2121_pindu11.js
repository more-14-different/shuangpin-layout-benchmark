#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {loadPayload} = require('./score_completion_ckt_v4.js');
const {
  buildFactorizations,
  buildTokenInventory,
  indexedFactorization,
  searchOne,
} = require('./search_toned_2121_factorizations.js');
const {
  codeFor,
  optimizeLayout,
  projectedMotor,
} = require('./optimize_toned_2121_physical.js');
const {buildToned2121Contract} = require('./toned_2121_contract.js');

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

function expandTonedCodes(layout, candidate, factorization, layoutTokens, contract) {
  const firstGroupByComponent = Int16Array.from(factorization.firstComponents.map(value =>
    candidate.firstGroups[value]));
  const secondGroupByComponent = Int16Array.from(factorization.secondComponents.map(value =>
    candidate.secondGroups[value]));
  const rows = [contract.soundKeysByRow.upper, contract.soundKeysByRow.home,
    contract.soundKeysByRow.lower];
  const firstKeys = [...layout.physicalSearch.firstGroupKeys];
  const columns = layout.physicalSearch.secondGroupColumnPositions;
  layout.tonedCodes = layoutTokens.map(token => codeFor(token, firstGroupByComponent,
    secondGroupByComponent, factorization, firstKeys, columns, rows));
  layout.firstComponentKeys = Object.fromEntries(factorization.firstComponents.map((value, at) =>
    [value, firstKeys[firstGroupByComponent[at]]]));
  layout.secondComponentColumns = Object.fromEntries(factorization.secondComponents.map((value, at) =>
    [value, columns[secondGroupByComponent[at]]]));
  layout.secondComponentPhysicalKeys = Object.fromEntries(
    factorization.secondComponents.map((value, at) => {
      const column = columns[secondGroupByComponent[at]];
      return [value, rows.map(row => row[column]).join('')];
    }));
  return layout;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, '..');
  const html = path.resolve(args.html || path.join(root, 'a7_CKT_R11.html'));
  const seedsFile = path.resolve(args.seeds || path.join(root,
    'research/config/ckt-v51-toned-2121-seeds.json'));
  const output = path.resolve(args.output || path.join(root,
    'research/config/ckt-v51-toned-2121-pindu11-screen-layouts.json'));
  const runs = Number(args.runs || 8);
  const structuralSteps = Number(args['structural-steps'] || 30000);
  const structuralRestarts = Number(args['structural-restarts'] || 4);
  const physicalSteps = Number(args['physical-steps'] || 10000);
  const physicalRestarts = Number(args['physical-restarts'] || 3);
  const baseSeed = Number(args.seed || 11072121);

  const data = loadPayload(html);
  const inventory = JSON.parse(fs.readFileSync(seedsFile, 'utf8'));
  const tokens = buildTokenInventory(data, inventory);
  const layoutInventory = {...inventory, auditTokenKeys:
    inventory.layoutTokenKeys || inventory.auditTokenKeys || inventory.tokenKeys};
  const layoutTokens = buildTokenInventory(data, layoutInventory);
  const pinyin = inventory.decomposition.map(row => row.pinyin);
  const definition = buildFactorizations(inventory)
    .find(value => value.id === 'shengjie-pindu11-rhyme');
  const factorization = indexedFactorization(definition, pinyin);
  const contract = buildToned2121Contract();
  const motor = projectedMotor(data);
  const layouts = [];
  const fingerprints = new Set();

  for (let run = 0; run < runs; run++) {
    const structuralSeed = baseSeed + run * 104729;
    const physicalSeed = baseSeed + run * 130363 + 17;
    const structural = searchOne(tokens, factorization, {
      steps: structuralSteps,
      restarts: structuralRestarts,
      seed: structuralSeed,
    }).champion;
    const layout = optimizeLayout({
      candidate: structural,
      factorization,
      tokens,
      motor,
      contract,
      steps: physicalSteps,
      restarts: physicalRestarts,
      seed: physicalSeed,
    });
    expandTonedCodes(layout, structural, factorization, layoutTokens, contract);
    const fingerprint = layout.tonedCodes.join(',');
    if (fingerprints.has(fingerprint)) continue;
    fingerprints.add(fingerprint);
    layout.id = `SCREEN-shengjie-pindu11-rhyme-${String(run + 1).padStart(2, '0')}`;
    layout.origin = 'pindu11-multiseed-fixed-policy-screen';
    layout.screenSearch = {
      run,
      structuralSeed,
      physicalSeed,
      structuralSteps,
      structuralRestarts,
      physicalSteps,
      physicalRestarts,
    };
    layouts.push(layout);
  }

  const result = {
    version: 'ckt-v5.1-toned-2121-pindu11-screen-layouts-1',
    purpose: 'diverse Pindu11 seeds for fixed-policy CKT screening; not an exhaustive optimum proof',
    contract: {
      auxiliaryKeySet: contract.auxiliaryKeySet,
      soundKeys: contract.soundKeys,
      soundKeysByRow: contract.soundKeysByRow,
      toneRowAssignment: contract.primaryToneRowAssignment,
    },
    tokenKeys: inventory.layoutTokenKeys || inventory.auditTokenKeys || inventory.tokenKeys,
    layouts,
  };
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(layouts.map(value => ({
    id: value.id,
    occupiedBuckets: value.structuralMetrics.occupiedBuckets,
    tonedSyllableTop1: value.structuralMetrics.tonedSyllableTop1,
    motorUpperMs: value.physicalSearch.motorUpperMs,
    structuralSeed: value.screenSearch.structuralSeed,
  })), null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {expandTonedCodes};
