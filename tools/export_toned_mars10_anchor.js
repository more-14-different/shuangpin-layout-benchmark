#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function parseArgs(argv) {
  const args = {
    firstMoves: [],
    rhymeMoves: [],
  };
  for (let index = 0; index < argv.length; index++) {
    if (!argv[index].startsWith('--')) continue;
    const flag = argv[index].slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith('--')
      ? argv[++index]
      : true;
    if (flag === 'first-move') {
      args.firstMoves.push(value);
    } else if (flag === 'rhyme-move') {
      args.rhymeMoves.push(value);
    } else {
      args[flag] = value;
    }
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
  const expectedScore = Number(args['expected-score'] || 9.451430242464836);
  const layoutIdOverride = args['layout-id'];

  const fixture = JSON.parse(fs.readFileSync(baseFixturePath, 'utf8'));
  const tonedCodes = fixture.tonedCodes.map(tones => [...tones]);

  // Backward compatibility with single flags
  if (args.firstMoves.length === 0 && (args['first-atom'] || args['first-key'])) {
    const atom = String(args['first-atom'] || 'sh');
    const key = String(args['first-key'] || 'P').toUpperCase();
    args.firstMoves.push(`${atom}:${key}`);
  }
  if (args.rhymeMoves.length === 0 && (args['rhyme-region'] || args['rhyme-name'] || args['rhyme-key'])) {
    const region = String(args['rhyme-region'] || 'home');
    const rhyme = String(args['rhyme-name'] || 'u');
    const key = String(args['rhyme-key'] || 'K').toUpperCase();
    args.rhymeMoves.push(`${region}:${rhyme}:${key}`);
  }

  const appliedFirstMoves = [];
  for (const moveStr of args.firstMoves) {
    const match = String(moveStr).match(/^([^:]+):([A-Z])$/i);
    if (!match) throw new Error(`invalid first-move: ${moveStr}; expected ATOM:KEY`);
    const [, atomName, key] = match;
    const upperKey = key.toUpperCase();
    const atom = fixture.atoms.find(value => value.name === atomName);
    if (!atom) throw new Error(`first atom not found: ${atomName}`);

    for (const py of atom.pinyin) {
      for (let tone = 0; tone < 5; tone++) {
        const code = tonedCodes[py][tone];
        if (code) {
          tonedCodes[py][tone] = upperKey + code[1];
        }
      }
    }
    atom.baselineKey = upperKey;
    appliedFirstMoves.push({atomName, key: upperKey});
  }

  const appliedRhymeMoves = [];
  for (const moveStr of args.rhymeMoves) {
    const match = String(moveStr).match(/^([^:]+):([^:]+):([A-Z])$/i);
    if (!match) throw new Error(`invalid rhyme-move: ${moveStr}; expected REGION:RHYME:KEY`);
    const [, regionName, rhymeName, key] = match;
    const upperKey = key.toUpperCase();
    const region = fixture.toneRegions.find(value => value.name === regionName);
    if (!region) throw new Error(`tone region not found: ${regionName}`);
    const rhymeAtom = fixture.rhymeAtoms.find(value => value.name === rhymeName);
    if (!rhymeAtom) throw new Error(`rhyme atom not found: ${rhymeName}`);

    for (const py of rhymeAtom.pinyin) {
      for (const tone of region.tones) {
        const code = tonedCodes[py][tone - 1];
        if (code) {
          tonedCodes[py][tone - 1] = code[0] + upperKey;
        }
      }
    }
    rhymeAtom.baselineKeys[regionName] = upperKey;
    appliedRhymeMoves.push({regionName, rhymeName, key: upperKey});
  }

  const firstTags = appliedFirstMoves.map(m => `${m.atomName}-${m.key.toLowerCase()}`).join('-');
  const rhymeTags = appliedRhymeMoves.map(m => `${m.regionName}-${m.rhymeName}-${m.key.toLowerCase()}`).join('-');
  const anchorLayoutId = layoutIdOverride || `UNEVEN786-marsfirst-anchor-${firstTags}_${rhymeTags}`;

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
      appliedFirstMoves,
      appliedRhymeMoves,
      expectedScore,
    }),
  };

  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  process.stderr.write(`wrote ${outputPath}: layoutId=${anchorLayoutId}, expectedScore=${expectedScore}\n`);
}

if (require.main === module) main();

module.exports = {main};
