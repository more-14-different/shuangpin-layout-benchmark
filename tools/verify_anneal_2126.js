'use strict';
// Independent legacy row-builder/resolver verification; needs the original research inputs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {loadContext}=require('./frontier_toned_2126');
const {evaluate}=require('./explore_toned_2126');
const {layout,policies}=require('./anneal_2126_model');
const [bundleDir,resultFile,snow]=process.argv.slice(2);
if(!snow)throw new Error('usage: BUNDLE_DIR BEST_JSON SNOW_DIR');
const bundle=JSON.parse(fs.readFileSync(path.join(bundleDir,'search.json')));
const result=JSON.parse(fs.readFileSync(resultFile));
const rebuilt=layout(bundle,result.route,result.state);
assert.deepEqual(rebuilt.tonedCodes,result.layout.tonedCodes);
const context=loadContext(bundle,path.resolve(snow));
const oracle=evaluate(rebuilt,bundle.tokenKeys,context,policies[result.state.policy]);
assert.ok(Math.abs(oracle.score-result.score)<1e-10);
for(const k of Object.keys(oracle.tracks))for(const f of Object.keys(oracle.tracks[k]))assert.ok(Math.abs(oracle.tracks[k][f]-result.tracks[k][f])<1e-8,`${k}/${f}`);
console.log(JSON.stringify({passed:true,route:result.route,score:oracle.score,difference:oracle.score-result.score}));
