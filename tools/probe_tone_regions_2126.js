'use strict';
const fs = require('node:fs');
const {loadContext, layoutFactory} = require('./frontier_toned_2126.js');
const {prepare} = require('./fast_toned_2126.js');
const {POLICY} = require('./explore_toned_2126.js');

function assignments() {
  const result = [];
  for (let a = 1; a <= 4; a++) for (let b = a + 1; b <= 4; b++) {
    const rest = [1, 2, 3, 4].filter(t => t !== a && t !== b);
    for (let pairRow = 0; pairRow < 3; pairRow++) {
      const rows = [0, 1, 2].filter(r => r !== pairRow);
      for (const order of [rows, [...rows].reverse()]) {
        const mapping = {[a]: pairRow, [b]: pairRow, [rest[0]]: order[0], [rest[1]]: order[1]};
        mapping[5] = mapping[1];
        result.push(mapping);
      }
    }
  }
  return result;
}

function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('input and output required');
  const source = JSON.parse(fs.readFileSync(input, 'utf8'));
  const context = loadContext(source, 'D:/C2D/Documents/rime-snow-pinyin');
  const fast = prepare(source.tokenKeys, context);
  const policy = source.contract.policy || POLICY;
  const results = [];
  for (const toneRowsByTone of assignments()) {
    const variant = {...source, results: [{layout: {...source.results[0].layout, toneRowsByTone}}]};
    const layout = layoutFactory(variant)(source.results[0].layout.regionMaps);
    layout.id += '-tones' + [1, 2, 3, 4].map(t => toneRowsByTone[t]).join('');
    results.push({layout, ...fast(layout, policy)});
    if (results.length % 6 === 0) console.log(`tone assignments ${results.length}/36`);
  }
  results.sort((a, b) => a.score - b.score);
  fs.writeFileSync(output, JSON.stringify({...source, version: 'toned-2126-tone-assignment-probe-1',
    input, mode: 'tone-probe', history: undefined, evaluations: undefined,
    localOptimality: undefined, lastNeighborhood: undefined, results, complete: true,
    scope: '36 assignments of a merged lexical-tone pair and two singles; neutral follows tone 1; fixed rhyme keys'}, null, 2) + '\n');
  console.log(JSON.stringify(results.slice(0, 3).map(x => ({id: x.id, score: x.score, toneRowsByTone: x.layout.toneRowsByTone}))));
}
if (require.main === module) main();
module.exports = {assignments};
