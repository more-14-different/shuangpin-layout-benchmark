'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const readline=require('node:readline');
const model=require('./anneal_2126_model');
const dir=process.argv[2];
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
for(const [f,h] of Object.entries(manifest.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,f))).digest('hex'),h,'bundle corruption');
const bundle=JSON.parse(fs.readFileSync(path.join(dir,'search.json')));
const context=JSON.parse(fs.readFileSync(path.join(dir,'corpus.json')));
const motorModel=require('./ckt_v4_model');
context.motor=motorModel.projectedMotor(motorModel.upstreamMotor(context.motorSnapshot),context.motorSnapshot.keys,context.data.ckt.calibration.extension_maps);
const score=require('./fast_toned_2126').prepare(bundle.tokenKeys,context);
for(const [r,s] of Object.entries(bundle.seeds))assert.ok(Math.abs(score(model.layout(bundle,r,s.state),model.policies[s.state.policy]).score-s.score)<1e-10,'seed drift');
console.log(JSON.stringify({ready:true,protocol:1,seeds:manifest.seedScores}));
const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
rl.on('line',line=>{
  try {
    const req=JSON.parse(line);const l=model.layout(bundle,req.route,req.state);
    const value=score(l,model.policies[req.state.policy]);
    console.log(JSON.stringify({...value,...(req.export?{layout:l,tokenKeys:bundle.tokenKeys,sources:bundle.sources}: {})}));
  }catch(error){console.log(JSON.stringify({error:error.stack}));}
});
