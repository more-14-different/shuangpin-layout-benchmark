'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process'),readline=require('node:readline');
const ROOT=path.resolve(__dirname,'..');
const fileHash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const defaults={templates:path.join(ROOT,'research/.cache/untoned-v51-templates.json'),binary:path.join(ROOT,'research/ckt-v4-core/target/release/score-untoned-v51-stream.exe'),snapshot:path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json')};
function launch(options={}) {
  const args={...defaults,...options};
  const child=spawn(args.binary,[args.templates,args.snapshot],{cwd:ROOT,stdio:['pipe','pipe','inherit'],windowsHide:true});
  let pending,resolveReady,rejectReady;
  const ready=new Promise((r,j)=>{resolveReady=r;rejectReady=j;});
  const fail=e=>{rejectReady(e);pending?.reject(e);pending=null;};
  readline.createInterface({input:child.stdout}).on('line',line=>{
    try {const result=JSON.parse(line);if(result.ready)resolveReady(result);else if(pending){const p=pending;pending=null;p.resolve(result);}else fail(Error('Unsolicited stream score'));}catch(e){fail(e);}
  });
  child.on('error',fail);child.on('exit',code=>fail(Error(`Score stream exited ${code}`)));
  return {child,ready,score:request=>new Promise((resolve,reject)=>{if(pending)return reject(Error('Stream worker busy'));pending={resolve,reject};child.stdin.write(JSON.stringify(request)+'\n');})};
}
function validateTemplates(file=defaults.templates) {
  const fixture=JSON.parse(fs.readFileSync(file,'utf8'));
  for(const [source,digest] of Object.entries(fixture.sourceHashes))if(fileHash(source)!==digest)throw Error(`Changed template source: ${source}`);
  return {sha256:fileHash(file),sourceHashes:fixture.sourceHashes,rows:fixture.modes.map(m=>m.length)};
}
function compare(actual,expected,tolerance=1e-9) {
  const diffs=[];
  if(Math.abs(actual.score-expected.score)>tolerance)diffs.push({field:'score',actual:actual.score,expected:expected.score});
  let maxDifference=Math.abs(actual.score-expected.score);
  for(const mode of ['keytao','sanpin'])for(const kind of ['character','word2','word3','word4'])for(const [key,value] of Object.entries(expected.modes[mode][kind])) {
    if(typeof value!=='number')continue;
    const got=actual.modes[mode][kind][key],difference=Math.abs(got-value);
    maxDifference=Math.max(maxDifference,difference);
    if(!Number.isFinite(got)||difference>tolerance)diffs.push({field:`${mode}.${kind}.${key}`,actual:got,expected:value});
  }
  if(diffs.length)throw Error(`Stream/JS mismatch: ${JSON.stringify(diffs)}`);
  return maxDifference;
}
module.exports={defaults,launch,validateTemplates,compare,fileHash};
