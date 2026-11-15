'use strict';

// Full 144-policy enumeration per member; preserve the existing CKT v5.1
// routes, physical auxiliary mapping and fixed S005 reference.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const crypto = require('node:crypto');
const aux = require('./search_ckt_v51_aux_order');
const scorer = require('./score_completion_ckt_v4'), model = require('./ckt_v4_model');
const search = require('./search_untoned_production_v51');
const ROOT = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function main() {
  const args = aux.parseArgs(process.argv.slice(2));
  const html = path.resolve(args.html || path.join(ROOT, 'a7_CKT_R11.html'));
  const snow = path.resolve(args.snow || 'D:/C2D/Documents/rime-snow-pinyin');
  const output = path.resolve(args.output || path.join(ROOT, 'research/notes/2026-11-15-untoned-2121-candidates-aux-components.json.gz'));
  const data = scorer.loadPayload(html);
  const baseline = data.entries.find(e => e.id === 'QZ-e8f37a0998f9');
  const selected = [baseline];
  const sources = [];
  for (const [filename, ids] of [
    ['2026-11-15-untoned-2121-other-centers.json', ['OC21-bf9bf45a7e60', 'OC21-e83f8962f55f', 'OC21-e1f155973380']],
    ['2026-11-14-untoned-2121-local-closure.json', ['LC21-7c18c710e175', 'LC21-c5a837308125']],
    ['2026-11-14-untoned-2121-v51-partial.json', ['UV51-21-346435e299f8']],
  ]) {
    const file = path.join(ROOT, 'research/notes', filename), report = read(file);
    sources.push(file);
    const rows = report.records ? Object.values(report.records) : report.families.flatMap(f => f.results);
    for (const id of ids) {
      const row = rows.find(row => row.id === id);
      if (!row) throw Error('missing layout ' + id);
      selected.push(search.rebuild({...baseline, ...row}, data));
    }
  }
  const {buildRowsForOrder, orderedDistinctPairs} = require(path.join(snow, 'scripts/research/evaluate_ckt_v4_word_aux_order.js'));
  const {buildExtendedWord3Rows, permutations, summarize} = require(path.join(snow, 'scripts/research/evaluate_ckt51_aux_order.js'));
  const snapshotFile = path.join(ROOT, 'tools/ckt_v4_upstream_role_tables.json'), snapshot = read(snapshotFile);
  const context = {data, model, scorer, buildRowsForOrder, orderedDistinctPairs, buildExtendedWord3Rows, permutations, summarize,
    strokes: scorer.strokeOptions(path.join(snow, 'rime-stroke/stroke.dict.yaml')),
    words: scorer.multiwords(path.join(snow, 'snow_pinyin.base.dict.yaml'), data, 0.99)};
  const motor = () => model.projectedMotor(model.upstreamMotor(snapshot), snapshot.keys, data.ckt.calibration.extension_maps);
  context.motor = motor();
  const reference = data.entries.find(e => e.id === 'S005');
  const references = Object.fromEntries(['keytao', 'sanpin'].map(mode => [mode, aux.referenceMode(reference, mode, aux.REFERENCE_POLICIES[mode], context)]));
  const inputFiles = [html, ...sources, __filename, path.join(ROOT, 'tools/search_ckt_v51_aux_order.js'), snapshotFile,
    path.join(ROOT, 'tools/ckt_v4_model.js'), path.join(ROOT, 'tools/score_completion_ckt_v4.js'),
    path.join(ROOT, 'tools/auxiliary_semantics.js'), path.join(snow, 'scripts/research/evaluate_ckt_v4_word_aux_order.js'),
    path.join(snow, 'scripts/research/evaluate_ckt51_aux_order.js'), path.join(snow, 'snow_pinyin.base.dict.yaml'),
    path.join(snow, 'rime-stroke/stroke.dict.yaml')];
  const out = {version: 'untoned-2121-candidates-aux-components-1',
    sourceHashes: Object.fromEntries(inputFiles.map(file => [file, hash(file)])),
    contract: {capacity: [21, 21], common399: true, toneKeysByTone: 'IVUAO', shapeKeysByMeaning: 'AVUIO', toneDigitsByShapeMeaning: '42310',
      policySpacePerMember: 144, word2AndWord4: 'joint candidate pool', word3: 'AAA+BBB independent staged pool', pageSize: 6},
    baselineCostsMs: aux.BASELINE, trackWeights: aux.TRACK_WEIGHTS, referencePolicies: aux.REFERENCE_POLICIES, references, schemes: []};
  for (const entry of selected) {
    const audit = search.audit(entry, data);
    if (!audit.valid || audit.M !== 42 || audit.D !== 2 || audit.V !== 5 || audit.qz || audit.zq || audit.branches) throw Error('contract differs: ' + entry.id);
    const cases = {};
    for (const mode of ['keytao', 'sanpin']) {
      context.motor = motor();
      cases[mode] = aux.enumerateMode(entry, mode, context);
      if (cases[mode].results.length !== 144) throw Error('incomplete policy space');
      console.log(entry.id, mode, '144 policies completed');
    }
    let power = 0;
    for (const mode of ['keytao', 'sanpin']) {
      const p = aux.REFERENCE_POLICIES[mode], key = `${p.word2}/${p.word3}/${p.word4}`;
      const tracks = cases[mode].results.find(row => row.policyKey === key).tracks;
      for (const [kind, weight] of Object.entries(aux.TRACK_WEIGHTS)) power += weight * (tracks[kind].effectiveMs / references[mode].tracks[kind].effectiveMs) ** 4;
    }
    const fixedScore = 10 * (power / 12) ** 0.25;
    const expected = entry.score ?? entry.productionCandidateMetrics.replayedCktV51;
    if (Math.abs(fixedScore - expected) > 1e-9) throw Error('fixed-policy anchor differs: ' + entry.id + ' ' + fixedScore + ' ' + expected);
    out.schemes.push({id: entry.id, initialMap: entry.initialMap, finalMap: entry.finalMap, audit, fixedScore, cases});
    fs.mkdirSync(path.dirname(output), {recursive: true});
    fs.writeFileSync(output + '.tmp', zlib.gzipSync(JSON.stringify(out), {level: 9}));
    fs.renameSync(output + '.tmp', output);
    if (global.gc) global.gc();
  }
  console.log('Saved', out.schemes.length, 'layouts to', output);
}

if (require.main === module) main();
