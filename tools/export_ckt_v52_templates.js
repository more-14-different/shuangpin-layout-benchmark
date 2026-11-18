'use strict';
// Symbolic terminal templates retain the existing native candidate construction.
const fs = require('node:fs');
const path = require('node:path');
const scorer = require('./score_completion_ckt_v4');
const native = require('./score_toned_2121_ckt_v51');
const ROOT = path.resolve(__dirname, '..');
const read = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));

function main() {
  const fixture = read(path.join(ROOT, 'research/.cache/cr-lan-fixed-20261117/inputs/fixture.json'));
  const spec = read(path.join(ROOT, 'research/.cache/cr-lan-fixed-20261117/inputs/seeds.json'));
  if (fixture.atoms.length !== 26 || spec.roots.length !== 18) throw Error('symbolic template dimensions changed');
  const data = read(path.join(ROOT, 'a7_CKT_R11_integrated_materials/cr_lan_f19/payload-input.json'));
  const words = scorer.multiwords('D:/C2D/Documents/rime-snow-pinyin/snow_pinyin.base.dict.yaml', data, .99);
  const first = [], roots = [], regions = [];
  fixture.atoms.forEach((atom, index) => atom.pinyin.forEach(py => first[py] = index));
  fixture.rhymeAtoms.forEach((atom, index) => atom.pinyin.forEach(py => roots[py] = spec.finalRoots[index]));
  fixture.toneRegions.forEach((region, index) => region.tones.forEach(tone => regions[tone] = index));
  const layout = {tonedCodes: []}, bundle = {tokenKeys: []};
  fixture.tonedCodes.forEach((codes, py) => codes.forEach((code, index) => {
    if (!code) return;
    layout.tonedCodes.push(String.fromCharCode(256 + first[py], 256 + 26 + 18 * regions[index+1] + roots[py]));
    bundle.tokenKeys.push(fixture.pinyin[py] + (index+1));
  }));
  const policy = {word2: '21', word3: '213', word4: '14'};
  let rows = native.buildCharacterRows(layout, bundle, data, 'IVUAO');
  for (const kind of ['word2', 'word3', 'word4']) {
    rows = rows.concat(native.buildWordRows(layout, bundle, data, words, 'IVUAO', kind, policy[kind]));
  }
  rows.sort((a,b) => b.weight-a.weight || (a.id < b.id ? -1 : 1));
  const packed = new Int32Array(rows.length * 9);
  let offset = 0;
  for (const row of rows) {
    const terminal = row.stages.at(-1).codes[0];
    if (!Number.isInteger(row.weight) || row.weight > 2147483647) throw Error('unsupported frequency');
    packed[offset++] = ['character','word2','word3','word4'].indexOf(row.kind);
    packed[offset++] = row.weight;
    packed[offset++] = terminal.length;
    for (let position=0; position<6; position++) {
      const symbol = terminal.charCodeAt(position);
      packed[offset++] = symbol >= 256 ? symbol-256 : 80 + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ;,./'.indexOf(terminal[position]);
    }
  }
  const output = path.join(ROOT, 'research/.cache/cr-76-aeo-v52/templates.bin');
  fs.mkdirSync(path.dirname(output), {recursive:true});
  fs.writeFileSync(output, Buffer.from(packed.buffer));
  console.log(JSON.stringify({output, rows:rows.length, policy}));
}
if (require.main === module) main();
