'use strict';
// Exhaustive 6 x 4 cross of the two observed local rhyme mechanisms.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {makeContext,rebuild,audit,ergonomics,comfort,legal}=require('./search_untoned_production_v51');
const root=path.resolve(__dirname,'..'),file=path.join(root,'research/notes/2026-11-14-untoned-2121-cross.json');
const ctx=makeContext('D:/C2D/Documents/rime-snow-pinyin',path.join(root,'a7_CKT_R11.html'),path.join(root,'research/.cache/ckt-v4-ergonomics.json'));
const template=ctx.data.entries.find(e=>e.id==='QZ-e8f37a0998f9');
const base={...template,audit:audit(template,ctx.data),erg:ergonomics(template,ctx.data,ctx.fixture,ctx.motor)};
const results=[];
const report={version:'untoned-2121-cross-1',sources:{htmlSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'a7_CKT_R11.html'))).digest('hex')},contract:{scope:'en=E,uan=D; all six permutations v/ve/vn on D/E/G; four ai/an/iong/u arrangements',policy:'fixed production v5.1',memory:'M-R2<=42,D<=2,QZ/ZQ empty'},families:[{id:base.id,baseline:{audit:base.audit,erg:base.erg,score:9.56789806405906},results}]};
function evaluate(e,mutation){
 e=rebuild(e,ctx.data);e.audit=audit(e,ctx.data);if(!legal(e,base))throw Error('illegal '+mutation);
 e.erg=ergonomics(e,ctx.data,ctx.fixture,ctx.motor);const r=ctx.score(e);
 const row={id:'CROSS-'+results.length,mutation,initialMap:e.initialMap,finalMap:e.finalMap,toneKeysByTone:e.tone,capacity:e.capacity,audit:e.audit,erg:e.erg,score:r.score,modes:r.modes,strictComfort:comfort(e,base)};
 results.push(row);fs.writeFileSync(file,JSON.stringify(report,null,2));console.log(JSON.stringify({id:row.id,mutation,score:r.score,mx:e.erg.mx,home:e.erg.homeS2}));return r.score;
}
if(Math.abs(evaluate(template,'production')-9.56789806405906)>1e-10)throw Error('baseline mismatch');
for(const v of 'DEG')for(const ve of 'DEG')for(const vn of 'DEG'){
 if(new Set([v,ve,vn]).size!==3)continue;
 for(const arrangement of ['original','ai/an','NH','NH+u/an']){
  const finalMap={...template.finalMap,en:'E',uan:'D',v,ve,vn};
  if(arrangement==='ai/an')[finalMap.ai,finalMap.an]=[finalMap.an,finalMap.ai];
  if(arrangement.startsWith('NH')){finalMap.ai='H';finalMap.iong='N';finalMap.u='N';}
  if(arrangement==='NH+u/an')[finalMap.u,finalMap.an]=[finalMap.an,finalMap.u];
  evaluate({...template,finalMap},`en/uan; v/ve/vn=${v}${ve}${vn}; ${arrangement}`);
 }
}
report.completed=true;fs.writeFileSync(file,JSON.stringify(report,null,2));
