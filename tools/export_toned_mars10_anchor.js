#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

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

function hashJson(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, '..');
  const baseFixturePath = path.resolve(args['base-fixture'] || path.join(root,
    'research/.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json'));
  const outputPath = path.resolve(args.output || path.join(root,
    'research/.cache/ckt-v51-toned-mars10-anchor-sh-p-u-k.json'));
  const firstAtomName = String(args['first-atom'] || 'sh');
  const firstKey = String(args['first-key'] || 'P').toUpperCase();
  const rhymeRegionName = String(args['rhyme-region'] || 'home');
  const rhymeName = String(args['rhyme-name'] || 'u');
  const rhymeKey = String(args['rhyme-key'] || 'K').toUpperCase();
  const expectedScore = Number(args['expected-score'] || 9.451430242464836);

  const fixture = JSON.parse(fs.readFileSync(baseFixturePath, 'utf8'));

  const firstAtom = fixture.atoms.find(value => value.name === firstAtomName);
  if (!firstAtom) throw new Error(`first atom not found: ${firstAtomName}`);
  const rhymeAtom = fixture.rhymeAtoms.find(value => value.name === rhymeName);
  if (!rhymeAtom) throw new Error(`rhyme atom not found: ${rhymeName}`);
  const region = fixture.toneRegions.find(value => value.name === rhymeRegionName);
  if (!region) throw new Error(`tone region not found: ${rhymeRegionName}`);

  const tonedCodes = fixture.tonedCodes.map(tones => [...tones]);

  // Update first atom pinyins
  for (const py of firstAtom.pinyin) {
    for (let tone = 0; tone < 5; tone++) {
      const code = tonedCodes[py][tone];
      if (code) {
        tonedCodes[py][tone] = firstKey + code[1];
      }
    }
  }

  // Update rhyme atom pinyins in specified region
  for (const py of rhymeAtom.pinyin) {
    for (const tone of region.tones) {
      const code = tonedCodes[py][tone - 1];
      if (code) {
        tonedCodes[py][tone - 1] = code[0] + rhymeKey;
      }
    }
  }

  // Update atom baseline keys
  firstAtom.baselineKey = firstKey;
  rhymeAtom.baselineKeys[rhymeRegionName] = rhymeKey;

  const anchorLayoutId = `UNEVEN786-marsfirst-anchor-${firstAtomName}-${firstKey.toLowerCase()}-${rhymeName}-${rhymeKey.toLowerCase()}`;
  fixture.layoutId = anchorLayoutId;
  fixture.tonedCodes = tonedCodes;
  fixture.expected = {
    ...fixture.expected,
    score: expectedScore,
    traditionalOnsetD: 0,
    onsetFragmentation: 0,
  };
  fixture.baselineMemoryLower = 20;
  fixture.baselineMemoryGuard = 22;
  fixture.baselineToneRegionMergeLower = 9;

  fixture.sourceHashes = {
    ...fixture.sourceHashes,
    anchor: hashJson({
      layoutId: anchorLayoutId,
      firstAtomName,
      firstKey,
      rhymeRegionName,
      rhymeName,
      rhymeKey,
      expectedScore,
    }),
  };

  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  process.stderr.write(`wrote ${outputPath}: layoutId=${anchorLayoutId}, expectedScore=${expectedScore}\n`);
}

if (require.main === module) main();

module.exports = {main};
