'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {ALPHABET,HEADS,FINALS,splitPinyin}=require('./ckt_v4_scheme_fixture');
const scorer=require('./score_completion_ckt_v4'),model=require('./ckt_v4_model'),v52=require('./score_ckt_v52');
const ROOT=path.resolve(__dirname,'..');
const KINDS=['character','word2','word3','word4'];
const POLICIES={keytao:{word2:'12',word3:'12',word4:'24'},sanpin:{word2:'12',word3:'21',word4:'13'}};
function compileRows(rows,words,data,entry) {
  const pools=new Map(['char:base','char:aux1','char:aux2','word:four','word:five','word:six','word3:three'].map((p,i)=>[p,i]));
  const priority=[...rows].sort((a,b)=>b.weight-a.weight||(a.id<b.id?-1:a.id>b.id?1:0));
  const ties=new Map(priority.map((r,i)=>[r.id,i]));
  const syllable=p=> {const [h,f]=splitPinyin(data.pinyin[p]);return h===255||f===255?[...entry.codeList[p]].map(k=>62+ALPHABET.indexOf(k)):[h,27+f];};
  return rows.map(row=> {
    let prefix;
    if(row.kind==='character')prefix=syllable(Number(row.id.slice(row.id.lastIndexOf(':')+1)));
    else {
      const i=Number(row.id.slice(row.id.lastIndexOf(':')+1)),item=words[row.kind][i],pairs=item.py.map(syllable);
      prefix=row.kind==='word2'?pairs.flat():row.kind==='word3'?[...pairs.map(p=>p[0]),pairs[2][1]]:pairs.map(p=>p[0]);
    }
    const stages=row.stages.map(stage=> {
      if(stage.length>4&&stage.codes.length!==1)throw Error('long-code alternatives need full v5.2 routing');
      const count=Math.min(prefix.length,stage.length);
      return [stage.order,pools.get(stage.pool),stage.codes.map(code=>[...prefix.slice(0,count),...[...code.slice(count)].map(k=>62+ALPHABET.indexOf(k))])];
    });
    for(let i=0;i<stages.length;i++)for(let j=0;j<stages[i][2].length;j++) {
      const layout=[...HEADS.map(h=>entry.initialMap[h]),...FINALS.map(f=>entry.finalMap[f])];
      const decoded=stages[i][2][j].map(t=>t<62?layout[t]:ALPHABET[t-62]).join('');
      if(decoded!==row.stages[i].codes[j])throw Error(`Row template mismatch ${row.id}`);
    }
    return [ties.get(row.id),KINDS.indexOf(row.kind),row.weight,row.baseLength,stages];
  });
}
function main(){
const data=scorer.loadPayload(path.join(ROOT,'a7_CKT_R11.html'));
const profile=path.join(ROOT,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json');
const ctx=v52.context(data,'D:/C2D/Documents/rime-snow-pinyin',profile);
const ref=v52.evaluateUntoned(data.entries.find(e=>e.id==='S005'),{keytao:{word2:'12',word3:'213',word4:'24'},sanpin:{word2:'12',word3:'213',word4:'23'}},null,ctx);
const entry=data.entries.find(e=>e.id==='RC26-39a5bfdc045342cd'),modes=[];
for(const mode of ['keytao','sanpin']){
const rows=[...scorer.buildRows(entry,data,ctx.strokes,{word2:[],word3:[],word4:[]},mode),...Object.entries(POLICIES[mode]).flatMap(([kind,order])=>ctx.buildRowsForOrder(entry,data,ctx.words,mode,entry.tone,kind,order,model))];
modes.push(compileRows(rows,ctx.words,data,entry));
console.log(JSON.stringify({compiled:mode,rows:rows.length}));
}
const refs=m=>['keytao','sanpin'].map(mode=>KINDS.map(k=>{const t=ref.v52[mode][k];return t.motorUpperMs+m*(t.effectiveMs-t.motorUpperMs)}));
const output=path.join(ROOT,'research/.cache/untoned-r2-v52-templates.json');
const sources=['tools/ckt_v4_upstream_role_tables.json','tools/score_ckt_v52.js','tools/ckt_block_error.js','tools/score_completion_ckt_v4.js','a7_CKT_R11.html',profile,'D:/C2D/Documents/rime-snow-pinyin/snow_pinyin.base.dict.yaml','D:/C2D/Documents/rime-snow-pinyin/rime-stroke/stroke.dict.yaml',__filename];
const sourceHashes=Object.fromEntries(sources.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.resolve(ROOT,p))).digest('hex')]));
fs.writeFileSync(output,JSON.stringify({version:'untoned-r2-v52-physical-row-templates-1',keyAlphabet:ALPHABET,toneKeysByTone:entry.tone,shapeKeysByMeaning:require('./auxiliary_semantics').shapeKeysFromToneKeys(entry.tone),policies:POLICIES,references:refs(1),references2:refs(2),referenceModes:ref.v52,sourceHashes,modes}));
console.log(JSON.stringify({output}));
}
if(require.main===module)main();
module.exports={compileRows,POLICIES};
