'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const native = require('./score_toned_2121_ckt_v51');
const corpus = require('./score_completion_ckt_v4');
const {blockErrorMotor} = require('./ckt_block_error');
const {auxiliarySemantics} = require('./auxiliary_semantics');
const ROOT = path.resolve(__dirname, '..');
const read = filename => JSON.parse(fs.readFileSync(path.resolve(ROOT, filename), 'utf8'));
const hash = filename => crypto.createHash('sha256').update(fs.readFileSync(path.resolve(ROOT, filename))).digest('hex');

function main() {
  const filename = process.argv[2] || 'research/notes/2026-11-18-cr-76-aeo-v52.json';
  const report = read(filename);
  const fixture = read('research/.cache/cr-lan-fixed-20261117/inputs/fixture.json');
  const spec = read('research/.cache/cr-lan-fixed-20261117/inputs/seeds.json');
  const data = read('a7_CKT_R11_integrated_materials/cr_lan_f19/payload-input.json');
  const snow = 'D:/C2D/Documents/rime-snow-pinyin';
  const words = corpus.multiwords(path.join(snow, 'snow_pinyin.base.dict.yaml'), data, .99);
  const summarize = require(path.join(snow, 'scripts/research/evaluate_ckt51_aux_order')).summarize;
  const reference = {tracks: read('research/notes/2026-11-18-ckt-v52-all-schemes.json').references.v52.keytao, summarize};
  const motor = blockErrorMotor(read('tools/ckt_v4_upstream_role_tables.json'),
    read('research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json'));
  assert.equal(auxiliarySemantics(report.toneKeysByTone).shapeKeysByMeaning, report.shapeKeysByMeaning);
  const first = [], roots = [], regions = [];
  fixture.atoms.forEach((atom, index) => atom.pinyin.forEach(py => first[py] = index));
  fixture.rhymeAtoms.forEach((atom, index) => atom.pinyin.forEach(py => roots[py] = spec.finalRoots[index]));
  fixture.toneRegions.forEach((region, index) => region.tones.forEach(tone => regions[tone] = index));
  const rows = process.argv.includes('--selected-only') ? report.selected : [...report.controls,...report.selected,...report.frontier];
  const candidates = new Map(rows.map(row => [row.key,row]));
  const auditPath = path.resolve(ROOT,filename.replace(/\.json$/,'-verification.json'));
  const results = [];
  for (const row of candidates.values()) {
    const state = row.state;
    assert.equal(new Set(state.firstKeys.slice(20,23)).size, 1);
    if (report.constraints.fixedRootPartition) {
      const baseline = report.results[row.origin].baseline.state;
      assert.deepEqual(state.firstKeys,baseline.firstKeys);
      assert.deepEqual(state.partition,baseline.partition);
      state.groupKeys.forEach((region,index) => assert.deepEqual([...region].sort(),[...baseline.groupKeys[index]].sort()));
    }
    if (report.constraints.minRetroflexHome) {
      const retroflex = fixture.atoms.flatMap((atom,index) => ['ch','sh','zh'].includes(atom.name) ? [index] : []);
      assert.ok(retroflex.filter(index => 'ASDFGHJKL'.includes(state.firstKeys[index])).length >= report.constraints.minRetroflexHome);
    }
    if (report.constraints.minRetroflexOnRow) {
      const rowKeys = {home:'ASDFGHJKL',bottom:'ZXCVBNM',top:'QWERTYUIOP'}[report.constraints.retroflexRow];
      assert.ok(rowKeys,'unknown retroflex row');
      const indices = fixture.atoms.flatMap((atom,index) => ['ch','sh','zh'].includes(atom.name) ? [index] : []);
      assert.ok(indices.filter(index => rowKeys.includes(state.firstKeys[index])).length >= report.constraints.minRetroflexOnRow);
    }
    const layout = {tonedCodes: []}, bundle = {tokenKeys: []};
    fixture.tonedCodes.forEach((codes, py) => codes.forEach((code, index) => {
      if (!code) return;
      bundle.tokenKeys.push(fixture.pinyin[py] + (index+1));
      layout.tonedCodes.push(state.firstKeys[first[py]] + state.groupKeys[regions[index+1]][state.partition[roots[py]]]);
    }));
    const result = native.evaluateLayoutPolicy({layout, layouts:bundle, data, words, motor, reference,
      shapeKeysByMeaning:report.shapeKeysByMeaning, policy:report.policy});
    assert.ok(Math.abs(result.score-row.metrics.cktV52)<1e-9, row.key+' CKT');
    const loads = Array.from({length:4}, () => ({hits:0,left:0,right:0}));
    for (const outcome of result.outcomes) {
      const load = loads[['character','word2','word3','word4'].indexOf(outcome.kind)];
      for (const key of outcome.code) {
        load.hits += outcome.weight;
        if ('QAZ'.includes(key)) load.left += outcome.weight;
        if (key === 'P') load.right += outcome.weight;
      }
    }
    const left = Math.max(...loads.map(load => load.left/load.hits));
    const right = Math.max(...loads.map(load => load.right/load.hits));
    assert.ok(Math.abs(left-row.metrics.pinky)<1e-12);
    assert.ok(Math.abs(right-row.metrics.rightPinky)<1e-12);
    for (const kind of Object.keys(result.tracks)) {
      assert.ok(Math.abs(result.tracks[kind].effectiveMs-row.metrics.effectiveTracksV52[kind])<1e-7);
    }
    results.push({key:row.key,score:result.score,pinky:left,rightPinky:right});
    console.log(JSON.stringify({id:row.key.slice(0,10),score:result.score}));
  }
  const sources = ['tools/ckt_v52_toned_kernel.py','tools/search_cr_76_aeo_v52.py',
    'tools/export_ckt_v52_templates.js','tools/verify_cr_76_aeo_v52.js','tools/ckt_block_error.js',
    'research/config/cr-76-aeo-v52.json','research/.cache/cr-76-aeo-v52/templates.bin',
    'research/.cache/cr-lan-fixed-20261117/inputs/fixture.json',
    'research/.cache/cr-lan-fixed-20261117/inputs/seeds.json',
    'research/.cache/cr-lan-fixed-20261117/inputs/moving_hand.py',
    'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json',
    'tools/ckt_v4_upstream_role_tables.json', 'tools/score_toned_2121_ckt_v51.js',
    'tools/ckt_v4_model.js','tools/score_completion_ckt_v4.js',
    filename.replace(/\.json$/,'-scores.json.gz'),
    'a7_CKT_R11_integrated_materials/cr_lan_f19/payload-input.json',
    path.join(snow,'snow_pinyin.base.dict.yaml')];
  if (filename.includes('onsets')) sources.push('tools/search_cr_aeo_onsets_v52.py',
    'tools/search_cr_lan_aeo_heads.py','tools/search_cr_lan_f19_combined.py',
    'tools/search_cr_667_zero_carriers.py','tools/run_cr_anneal.py',
    'research/notes/2026-11-18-cr-lan-aeo-heads-scores.json.gz',
    'research/notes/2026-11-16-cr-stable-neighbors-finalists.json',
    'research/notes/2026-11-17-cr-667-neighbors-finalists.json');
  if (filename.includes('retroflex')) sources.push('tools/search_cr_retroflex_home_v52.py',
    'tools/search_cr_lan_aeo_heads.py','tools/search_cr_lan_f19_combined.py',
    'tools/search_cr_667_zero_carriers.py','tools/run_cr_anneal.py',
    'research/notes/2026-11-18-cr-aeo-onsets-v52.json',
    'research/notes/2026-11-16-cr-stable-neighbors-finalists.json');
  if (filename.includes('pair-group')) sources.push('tools/search_cr_pair_group_swaps_v52.py',
    'tools/search_cr_lan_f19_combined.py','tools/explore_cr_frontier_followup.py',
    'tools/search_cr_667_zero_carriers.py','tools/run_cr_anneal.py',
    'research/notes/2026-11-18-cr-aeo-onsets-v52.json',
    'research/notes/2026-11-18-cr-retroflex-top-v52.json');
  const audit = {version:report.version+'-native-verification-v1', reportHash:hash(filename),
    auxiliarySemantics:auxiliarySemantics(report.toneKeysByTone),
    results,sourceHashes:Object.fromEntries(sources.map(file => [file.replaceAll('\\','/'),hash(file)]))};
  fs.writeFileSync(auditPath, JSON.stringify(audit,null,2)+'\n');
}
if (require.main===module) main();
