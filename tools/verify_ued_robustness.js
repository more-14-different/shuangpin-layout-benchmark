'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {scoreModes}=require('./score_ckt_v52'),{normalize}=require('./search_untoned_cr7e_v52'),{optimum}=require('./verify_untoned_cr7e_v52');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'research/notes/2026-11-21-ued-robust-review');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function main(){
 const component=path.join(ROOT,'research/notes/2026-11-20-untoned-frontiers-r11-components-UED-18c004bd1f31.json.gz');
 const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(component))),margins=read(PREFIX+'-margins.json'),checks=[];let maximum=0;
 const repriced=(tracks,factors)=>Object.fromEntries(Object.entries(tracks).map(([k,t])=>[k,{...t,effectiveMs:t.motorUpperMs+data.coefficients.reduce((s,f,i)=>s+(t[f]||0)*data.baselineCostsMs[i]*factors[i],0)}]));
 const member=(mode,key,factors)=>scoreModes({[mode]:repriced(data.cases[mode].results.find(r=>r.policyKey===key).tracks,factors)},{[mode]:repriced(data.reference[mode],factors)});
 const close=(a,b,label)=>{const difference=Math.abs(a-b);assert.ok(difference<1e-10,label);maximum=Math.max(maximum,difference);checks.push(label);};
 for(const[name,modes]of Object.entries(margins.grids))for(const[mode,r]of Object.entries(modes)){
  for(const point of r.uniformCostPoints){const factors=Array(6).fill(point.multiplier),a=member(mode,r.winner.policy,factors),b=member(mode,r.runnerUp.policy,factors);close(a,point.winnerScore,name+'/'+mode+'/winner/'+point.multiplier);close(b,point.runnerScore,name+'/'+mode+'/runner/'+point.multiplier);close(b-a,point.gap,name+'/'+mode+'/gap/'+point.multiplier);}
  const point=r.worstPairwisePoint,a=member(mode,r.winner.policy,point.multipliers),b=member(mode,r.runnerUp.policy,point.multipliers);close(a,point.winnerScore,name+'/'+mode+'/worst-winner');close(b,point.runnerScore,name+'/'+mode+'/worst-runner');close(b-a,point.gap,name+'/'+mode+'/worst-gap');
 }
 for(const point of margins.jointUniformPointTop2){
  const optimal=optimum(data.cases,data.reference,point.multiplier);close(optimal.score,point.winner.score,'joint optimum '+point.multiplier);assert.deepEqual(optimal.policy,{keytao:point.winner.keytao,sanpin:point.winner.sanpin});
  const tracks=Object.fromEntries(['keytao','sanpin'].map(m=>[m,data.cases[m].results.find(r=>r.policyKey===point.runnerUp[m]).tracks]));close(normalize(tracks,data.reference,point.multiplier),point.runnerUp.score,'joint runner '+point.multiplier);
 }
 const browser=read(PREFIX+'-browser.json'),html=read(PREFIX+'-html.json');assert.ok(browser.completed&&html.completed);assert.equal(hash(html.html),html.htmlSha256);assert.equal(browser.htmlSha256,html.htmlSha256);assert.deepEqual(browser.pageErrors,[]);
 const files=[__filename,component,PREFIX+'-margins.json',PREFIX+'-browser.json',PREFIX+'-html.json',...['score_ckt_v52.js','search_untoned_cr7e_v52.js','verify_untoned_cr7e_v52.js'].map(f=>path.join(ROOT,'tools',f))];
 const result={completed:true,independentNumericChecks:checks.length,maxDifference:maximum,productionAndDetailNumericChecks:html.matchingNumericFields,productionDomAttributes:browser.productionAttributeChecks.length,csvExport:browser.csvExport,detailRows:browser.detailRows,htmlUnchanged:true,sourceHashes:Object.fromEntries(files.map(p=>[p,hash(p)]))};
 fs.writeFileSync(PREFIX+'-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
if(require.main===module)main();
