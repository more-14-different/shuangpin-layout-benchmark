#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {hashFile, parseArgs} = require('./export_ckt_v4_binary_fixture.js');
const {loadPayload} = require('./score_completion_ckt_v4.js');
const {buildSchemeFixture, selectSchemeEntries} = require('./ckt_v4_scheme_fixture.js');

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = path.resolve(__dirname, '..');
  const html = path.resolve(args.html || path.join(repo, 'a7_CKT_R11.html'));
  const output = path.resolve(
    args.output || path.join(repo, 'research', '.cache', 'ckt-v4-all-schemes.json'),
  );
  const ids = String(args.ids || 'all').split(',').filter(Boolean);
  const data = loadPayload(html);
  const entries = selectSchemeEntries(data, ids);
  const fixture = buildSchemeFixture(data, entries, hashFile(html));

  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  process.stderr.write(`wrote ${output} (${entries.length} schemes)\n`);
}

if (require.main === module) main();

module.exports = {main};
