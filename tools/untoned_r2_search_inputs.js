'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
// The native search only needs pinyin, Common399 weights and A's fallback
// spellings. Parsing the entire R11 publication in every search process kept
// several GB of unrelated benchmark data alive alongside the native workers.
function loadLayoutInputs(){
 const source=JSON.parse(fs.readFileSync(path.join(ROOT,'research/config/untoned-r2-restore399-v52-input.json'),'utf8'));
 const expected=source.sourceHashes['a7_CKT_R11.html'];
 const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,'a7_CKT_R11.html'))).digest('hex');
 assert.equal(actual,expected,'HTML snapshot changed; export new research inputs');
 const file=path.join(ROOT,'research/.cache/r2-restore399-v52/layout-inputs.json');
 if(fs.existsSync(file)){
  const saved=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(saved.version,1);assert.equal(saved.htmlSha256,expected,'stale minimal layout inputs');return saved;
 }
 const payload=require('./score_completion_ckt_v4').loadPayload(path.join(ROOT,'a7_CKT_R11.html'));
 const e=payload.entries.find(e=>e.id==='RC26-39a5bfdc045342cd');assert.ok(e);
 const saved={version:1,htmlSha256:expected,data:{pinyin:payload.pinyin,base:payload.base},template:Object.fromEntries(['id','capacity','tone','codeList','initialMap','finalMap'].map(k=>[k,e[k]]))};
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(saved));return saved;
}
if(require.main===module){const saved=loadLayoutInputs();console.log(JSON.stringify({common:saved.data.base.length,pinyin:saved.data.pinyin.length,htmlSha256:saved.htmlSha256}));}
module.exports={loadLayoutInputs};
