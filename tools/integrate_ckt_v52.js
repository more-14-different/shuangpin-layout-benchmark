'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const scorer=require('./score_completion_ckt_v4');
const {inventory,v51Digest}=require('./score_ckt_v52');
const ROOT=path.resolve(__dirname,'..');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function replaceOnce(source,before,after,label){
  if(source.includes(after))return source;
  const at=source.indexOf(before);if(at<0||source.indexOf(before,at+before.length)>=0)throw Error('non-unique HTML patch: '+label);
  return source.slice(0,at)+after+source.slice(at+before.length);
}
function patchUI(html,ui){
  html=replaceOnce(html,'({headers,rows,ids,raws}=snowJiandaoProductionTableRows(headers,rows,ids,key,raws));',
    '({headers,rows,ids,raws}=snowJiandaoProductionTableRows(headers,rows,ids,key,raws));\n /* CKT_V52_COLUMNS */\n if(typeof cktV52TableColumns===\'function\')({headers,rows,ids,raws}=cktV52TableColumns(headers,rows,ids,key,raws));','table adapter');
  html=replaceOnce(html,'<th>CKT-T v5.1 ↓</th><th>日常移动手 ↑</th>',
    '<th>CKT-T v5.1 ↓</th><th>CKT-T v5.2 ↓</th><th>日常移动手 ↑</th>','selection header');
  html=replaceOnce(html,'<td>${num(i.ckt.v51.score,9)}</td><td>${num(i.macro[',
    '<td>${num(i.ckt.v51.score,9)}</td><td>${num(i.ckt.v52.score,9)}</td><td>${num(i.macro[','selection score');
  html=replaceOnce(html,"['CKT v5.1',num(i.ckt.v51.score,9),num(q.ckt.v51,9),'各自生产合同；S005=10'],",
    "['CKT v5.1',num(i.ckt.v51.score,9),num(q.ckt.v51,9),'各自生产合同；S005=10'],\n  ['CKT v5.2',num(i.ckt.v52.score,9),num(q.ckt.v52,9),'各自v5.1生产合同；S005同步复算'],",'native comparison');
  html=replaceOnce(html,'<strong>${num(i.ckt.v51.score,6)}<small>CKT-T v5.1 ↓</small></strong></div>',
    '<strong>${num(i.ckt.v51.score,6)}<small>CKT-T v5.1 ↓</small></strong><strong>${num(i.ckt.v52.score,6)}<small>CKT-T v5.2 ↓</small></strong></div>','native hero');
  const script='<script id="ckt-v52-ui">\n'+ui+'\n</script>';
  // Export templates also contain closing body tags; install at the real end.
  html=html.replace(/<script id="ckt-v52-ui">[\s\S]*?<\/script>\n?/u,'');
  const end=html.lastIndexOf('</body>');
  assert.ok(end>=0,'missing closing body');
  html=html.slice(0,end)+script+'\n'+html.slice(end);
  return html;
}
function installData(data,publication){
  const before=v51Digest(data),targets=inventory(data),expected=[...targets.untoned,...targets.toned].map(x=>x.id).sort();
  assert.deepEqual(Object.keys(publication.schemes).sort(),expected);
  assert.equal(before,publication.v51BeforeDigest);
  for(const e of targets.untoned){const r=publication.schemes[e.id],p=e.productionCandidateMetrics;
    assert.ok(Math.abs(p.replayedCktV51-r.v51.score)<1e-9);
    p.replayedCktV52=r.v52.score;p.cktV52Aggregate=r.v52.aggregate;p.cktV52Policies=structuredClone(p.cktV51Policies);
    p.cktV52Modes=r.v52.modes;
    if(Number.isFinite(e.readmeBenchmarkMetrics?.cktV51))e.readmeBenchmarkMetrics.cktV52=r.v52.score;
  }
  for(const n of targets.toned){const r=publication.schemes[n.id];
    assert.ok(Math.abs(n.ckt.v51.score-r.v51.score)<1e-9);
    n.ckt.v52={score:r.v52.score,policy:structuredClone(n.ckt.v51.policy),reference:'S005 keytao-only; same v5.1 task; v5.2 long-code errors',tracks:r.v52.modes.keytao};
    n.ckt.aggregateV52=r.v52.aggregate;
  }
  const alias=data.tonedContractBenchmark.schemes.qzE8f37a;
  if(alias){const r=publication.schemes[alias.id];assert.ok(Math.abs(alias.ckt.v51-r.v51.score)<1e-9);
    alias.ckt.v52=r.v52.score;alias.ckt.aggregateV52=r.v52.aggregate}
  data.cktV52=publication;assert.equal(v51Digest(data),before);
  return {schemes:expected.length,members:Object.values(publication.schemes).reduce((s,r)=>s+Object.keys(r.v52.modes).length,0),
    tracks:Object.values(publication.schemes).reduce((s,r)=>s+Object.keys(r.v52.modes).length*4,0),v51BeforeDigest:before,v51AfterDigest:v51Digest(data)};
}
function main(){
  const args={};for(let i=2;i<process.argv.length;i++)if(process.argv[i].startsWith('--'))args[process.argv[i].slice(2)]=process.argv[++i];
  const htmlPath=path.resolve(args.html||path.join(ROOT,'a7_CKT_R11.html'));
  const publication=JSON.parse(fs.readFileSync(args.scores||path.join(ROOT,'research/notes/2026-11-18-ckt-v52-all-schemes.json'),'utf8'));
  const before=hash(htmlPath),data=scorer.loadPayload(htmlPath);
  if(!data.cktV52)assert.equal(before,publication.htmlBeforeSha256,'HTML changed since scoring');
  const coverage=installData(data,publication),ui=fs.readFileSync(path.join(__dirname,'ckt_v52_ui.js'),'utf8');
  let html=fs.readFileSync(htmlPath,'utf8');
  const start=html.indexOf('>',html.indexOf('<script id="payload"'))+1,end=html.indexOf('</script>',start);
  assert.ok(start>0&&end>start);
  const packed=zlib.gzipSync(Buffer.from(JSON.stringify(data)),{level:9,mtime:0}).toString('base64');
  html=html.slice(0,start)+packed+html.slice(end);html=patchUI(html,ui);
  assert.equal(hash(htmlPath),before,'HTML changed while integrating');
  const temporary=htmlPath+'.v52.tmp';fs.writeFileSync(temporary,html);fs.renameSync(temporary,htmlPath);
  const audit={version:'ckt-v52-html-integration-v1',...coverage,htmlBeforeSha256:before,htmlAfterSha256:hash(htmlPath),
    scoredHtmlSha256:publication.htmlBeforeSha256,
    sources:{scoring:hash(path.join(__dirname,'score_ckt_v52.js')),integration:hash(__filename),ui:hash(path.join(__dirname,'ckt_v52_ui.js'))}};
  fs.writeFileSync(path.join(ROOT,'research/notes/2026-11-18-ckt-v52-publication.json'),JSON.stringify(audit,null,2)+'\n');
  console.log(JSON.stringify(audit));
}
if(require.main===module)main();
module.exports={patchUI,installData,replaceOnce};
