'use strict';
// Read-only progress snapshot and bounded, validated strategy mailbox.
const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline'),assert=require('node:assert/strict');
const search=require('./search_a_locked_rhymes_v52');
const ROOT=path.resolve(__dirname,'..'),WORK=search.WORK,REVIEWS=path.join(WORK,'reviews');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const LANES=['A-regular','A-double-empty','UM40-regular','UM40-double-empty'];
function settings(raw){
 assert.ok(LANES.includes(raw.lane),'unknown lane');
 for(const field of ['explorationProbability','temperature','minSteps','maxSteps','seedPool'])assert.ok(Number.isFinite(raw[field]),field);
 assert.ok(raw.explorationProbability>=0&&raw.explorationProbability<=.8);
 assert.ok(raw.temperature>=.00001&&raw.temperature<=.01);
 assert.ok(Number.isInteger(raw.minSteps)&&raw.minSteps>=2&&raw.minSteps<=6);
 assert.ok(Number.isInteger(raw.maxSteps)&&raw.maxSteps>=raw.minSteps&&raw.maxSteps<=10);
 assert.ok(Number.isInteger(raw.seedPool)&&raw.seedPool>=1&&raw.seedPool<=24);
 return Object.fromEntries(['lane','explorationProbability','temperature','minSteps','maxSteps','seedPool'].map(k=>[k,raw[k]]));
}
function applyReview(command,report,{c,initials}=search.setup()){
 assert.ok(typeof command.summary==='string'&&command.summary.length<=12000);
 assert.ok(Array.isArray(command.strategies)&&command.strategies.length<=4);
 assert.ok(Array.isArray(command.transfers)&&command.transfers.length<=24);
 const strategies=command.strategies.map(settings);assert.equal(new Set(strategies.map(r=>r.lane)).size,strategies.length);
 const proposals=[],decisions=[],seen=new Set();
 for(const transfer of command.transfers){
  assert.ok(LANES.includes(transfer.targetLane));assert.ok(LANES.includes(transfer.sourceLane));
  assert.equal(typeof transfer.repairOneStep,'boolean');
  const from=report.lanes.find(l=>l.name===transfer.sourceLane),target=report.lanes.find(l=>l.name===transfer.targetLane);
  const source=[from.best,...from.top].find(r=>r?.id===transfer.sourceId);assert.ok(source,'unknown source candidate '+transfer.sourceId);
  const im=initials[target.name.startsWith('UM40')?'UM40':'A'],empty=target.name.endsWith('double-empty');
  const check=fm=>search.check(im,fm,c.inputs,empty),fm=search.decode(source.state);
  let states=check(fm)?[{finalMap:fm,mutation:'direct transfer'}]:[];
  if(!states.length&&transfer.repairOneStep)states=search.neighbors(fm).filter(r=>check(r.finalMap));
  const accepted=[];
  for(const row of states.slice(0,80)){
   const state=search.key(row.finalMap),id=target.name+':'+state;if(seen.has(id))continue;seen.add(id);
   proposals.push({targetLane:target.name,state,parent:source.id,mutation:'review transfer '+from.name+'; '+row.mutation});accepted.push(state);
  }
  decisions.push({...transfer,directLegal:check(fm),accepted:accepted.length});
 }
 return {version:1,id:command.id||new Date().toISOString(),createdAt:new Date().toISOString(),summary:command.summary,
  strategies,proposals,decisions,preserveHalfDoubleEmptyBudget:true};
}
async function snapshot(output){
 fs.mkdirSync(REVIEWS,{recursive:true});const report=read(path.join(WORK,'live-report.json'));
 const stats=Object.fromEntries(LANES.map(name=>[name,{count:0,lastImprovedAt:null,best:Infinity,byMutation:{},milestones:[],pareto:[]}])) ;
 const stream=readline.createInterface({input:fs.createReadStream(path.join(WORK,'scores.jsonl')),crlfDelay:Infinity});
 for await(const line of stream){
  let row;try{row=JSON.parse(line);}catch{continue;}
  const s=stats[row.assignedLane];if(!s)continue;s.count++;
  const mutation=row.mutation?.split(' ')[0]||'unknown';s.byMutation[mutation]=(s.byMutation[mutation]||0)+1;
  if(row.scores['1']<s.best){s.best=row.scores['1'];s.lastImprovedAt=row.scoredAt;s.milestones.push({id:row.id,scores:row.scores,time:row.scoredAt,mutation:row.mutation});}
  const axes=['1','2','3','5'];if(!s.pareto.some(a=>axes.every(k=>a.scores[k]<=row.scores[k])&&axes.some(k=>a.scores[k]<row.scores[k]))){
   s.pareto=s.pareto.filter(a=>!axes.every(k=>row.scores[k]<=a.scores[k])||!axes.some(k=>row.scores[k]<a.scores[k]));
   s.pareto.push({id:row.id,state:row.state,scores:row.scores});
  }
 }
 const pack=r=>r?{id:r.id,state:r.state,scores:r.scores,mutation:r.mutation}:null;
 const compact={...report,baseline:{id:report.baseline.id,score:report.baseline.score,doubledScore:report.baseline.doubledScore},
  lanes:report.lanes.map(l=>({...l,best:pack(l.best),top:l.top.map(pack),history:{...stats[l.name],milestones:stats[l.name].milestones.slice(-12),pareto:stats[l.name].pareto.sort((a,b)=>a.scores['1']-b.scores['1']).slice(0,20)}}))};
 const {c,initials}=search.setup();compact.transplantAudit=[];
 for(const from of compact.lanes)for(const to of compact.lanes)if(from.name!==to.name&&from.best){
  const im=initials[to.name.startsWith('UM40')?'UM40':'A'],fm=search.decode(from.best.state),empty=to.name.endsWith('double-empty');
  compact.transplantAudit.push({sourceLane:from.name,sourceId:from.best.id,targetLane:to.name,
   directLegal:search.check(im,fm,c.inputs,empty),legalOneStepRepairs:search.neighbors(fm).filter(r=>search.check(im,r.finalMap,c.inputs,empty)).length});
 }
 fs.writeFileSync(output,JSON.stringify(compact,null,2)+'\n');console.log(JSON.stringify({snapshot:output,exactScores:report.exactScores,status:report.status}));
}
function publish(input,sourceSnapshot){
 const report=read(path.join(WORK,'live-report.json')),command=read(input),result=applyReview(command,sourceSnapshot?read(sourceSnapshot):report);
 const stamp=new Date().toISOString().replace(/[:.]/g,'-');fs.mkdirSync(REVIEWS,{recursive:true});
 fs.writeFileSync(path.join(REVIEWS,stamp+'-validated.json'),JSON.stringify(result,null,2)+'\n');
 if(report.status==='running'||report.status==='waiting-for-memory'){
  const temp=path.join(WORK,'review-inbox.json.tmp');fs.writeFileSync(temp,JSON.stringify(result));fs.renameSync(temp,path.join(WORK,'review-inbox.json'));
 }
 console.log(JSON.stringify({id:result.id,strategies:result.strategies.length,proposals:result.proposals.length,decisions:result.decisions}));
}
if(require.main===module){const [command,file,sourceSnapshot]=process.argv.slice(2);(command==='snapshot'?snapshot(file):Promise.resolve().then(()=>publish(file,sourceSnapshot))).catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={LANES,settings,applyReview};
