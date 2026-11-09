#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {
  loadPayload,
  multiwords,
} = require('./score_completion_ckt_v4.js');
const {
  PRIMARY_TONE_ROW_ASSIGNMENT,
  buildToned2121Contract,
  enumerateToneRowAssignments,
} = require('./toned_2121_contract.js');

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

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
}

function summarizeTokens(tokens, rowCount) {
  const distinct = new Set();
  const byTone = Object.fromEntries([1, 2, 3, 4, 5].map(tone => [tone, {
    distinctSyllables: new Set(),
    tokenOccurrences: 0,
    tokenWeight: 0,
  }]));
  let totalWeight = 0;
  for (const token of tokens) {
    const key = `${token.pinyin}${token.tone}`;
    distinct.add(key);
    byTone[token.tone].distinctSyllables.add(token.pinyin);
    byTone[token.tone].tokenOccurrences++;
    byTone[token.tone].tokenWeight += token.weight;
    totalWeight += token.weight;
  }
  return {
    rows: rowCount,
    tokenOccurrences: tokens.length,
    tokenWeight: totalWeight,
    distinctTonedSyllables: distinct.size,
    minimumCollisionExcessAt441Buckets: Math.max(0, distinct.size - 441),
    byTone: Object.fromEntries(Object.entries(byTone).map(([tone, value]) => [tone, {
      distinctSyllables: value.distinctSyllables.size,
      tokenOccurrences: value.tokenOccurrences,
      tokenWeight: value.tokenWeight,
    }])),
  };
}

function characterInventory(data, positiveOnly) {
  const rows = data.characters.filter(row => row[4] && (!positiveOnly || row[3] > 0));
  const tokens = rows.map(row => ({
    pinyin: data.pinyin[row[1]],
    tone: row[2],
    weight: row[3],
  }));
  return summarizeTokens(tokens, rows.length);
}

function wordInventory(data, words) {
  const rows = Object.values(words).flat();
  const tokens = rows.flatMap(row => row.py.map((pinyinIndex, index) => ({
    pinyin: data.pinyin[pinyinIndex],
    tone: row.tones[index],
    weight: row.weight,
  })));
  return {
    ...summarizeTokens(tokens, rows.length),
    rowsByLength: Object.fromEntries(Object.entries(words).map(([kind, values]) => [kind, values.length])),
  };
}

function buildAudit({html, snow, mass = 0.99}) {
  const htmlFile = path.resolve(html);
  const snowDir = path.resolve(snow);
  const dictionary = path.join(snowDir, 'snow_pinyin.base.dict.yaml');
  const data = loadPayload(htmlFile);
  if (data.base.length !== 399) {
    throw new Error(`expected frozen Common399 inventory, got ${data.base.length}`);
  }
  const contract = buildToned2121Contract();
  const priorLogic = data.logicalPhase;
  if (!priorLogic?.version || !priorLogic?.uniformity?.templates) {
    throw new Error('frozen benchmark is missing logicalPhase decomposition evidence');
  }
  const fullWords = multiwords(dictionary, data, 1);
  const scoredWords = multiwords(dictionary, data, Number(mass));
  const toneRows = enumerateToneRowAssignments();
  const dragonSpiritLexicalRows = {upper: [4], home: [2, 3], lower: [1]};
  return {
    version: 'ckt-v5.1-toned-21x21-inventory-audit-1',
    contract,
    sources: {
      benchmarkHtml: {
        file: path.basename(htmlFile),
        sha256: sha256(htmlFile),
      },
      snowPinyin: {
        commit: execFileSync('git', ['-C', snowDir, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
        dictionary: 'snow_pinyin.base.dict.yaml',
        dictionarySha256: sha256(dictionary),
      },
    },
    inventory: {
      commonPinyin: data.base.length,
      commonCharactersAll: characterInventory(data, false),
      commonCharactersPositiveWeight: characterInventory(data, true),
      wordCorpusAllEligible: wordInventory(data, fullWords),
      wordCorpusCktV51: {
        frequencyMass: Number(mass),
        ...wordInventory(data, scoredWords),
      },
    },
    toneRowSearch: {
      lexicalTones: [1, 2, 3, 4],
      neutralTonePolicy: contract.neutralTonePolicy,
      labelledAssignmentCount: toneRows.length,
      primaryAssignment: PRIMARY_TONE_ROW_ASSIGNMENT,
      priorArtAssignment: dragonSpiritLexicalRows,
      priorArtAssignmentIncluded: toneRows.some(value =>
        JSON.stringify(value) === JSON.stringify(dragonSpiritLexicalRows)),
    },
    secondCodeFactorizationResearch: {
      selectionStatus: contract.secondCodeFactorizationSelectionStatus,
      candidates: contract.secondCodeFactorizations,
      warning: 'R11 defines these decomposition families and deeply studies the shengjie Pindu family in untoned 21x25/26 projections; it does not select a winner for the toned 3x7 second-key domain.',
      priorEvidence: {
        version: priorLogic.version,
        templates: priorLogic.uniformity.templates,
        pinduStructuralFindings: priorLogic.structuralFindings.filter(value =>
          value.family.startsWith('Pindu')),
      },
    },
    optimizationBoundary: {
      primary: 'CKT v5.1',
      hardGuards: [
        'bounded explicit memory M under a separately frozen definition',
        'bounded seed-relative shengjie displacement deltaD',
        'bounded seed-relative rhyme-family displacement deltaV',
      ],
      diagnosticsOnly: ['used toned-syllable buckets out of 441'],
      warning: '441 is capacity, not an optimization target or the number of distinct toned syllables; a lower-bucket layout is allowed to win whenever its full CKT v5.1 is lower.',
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(__dirname, '..');
  const audit = buildAudit({
    html: args.html || path.join(root, 'a7_CKT_R11.html'),
    snow: args.snow || 'D:/C2D/Documents/rime-snow-pinyin',
    mass: args.mass || 0.99,
  });
  const json = `${JSON.stringify(audit, null, 2)}\n`;
  if (args.output) {
    const output = path.resolve(args.output);
    fs.mkdirSync(path.dirname(output), {recursive: true});
    fs.writeFileSync(output, json, 'utf8');
  }
  if (!args.quiet) process.stdout.write(json);
}

if (require.main === module) main();

module.exports = {
  buildAudit,
  characterInventory,
  summarizeTokens,
  wordInventory,
};
