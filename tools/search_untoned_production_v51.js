#!/usr/bin/env node
'use strict';

// Bounded, reproducible native v5.1 search. Local ignored replay fixtures are
// inputs; production HTML and the deployed Rime repository are read-only.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const {ALPHABET, HEADS, FINALS, splitPinyin} = require('./ckt_v4_scheme_fixture');
const {auxiliarySemantics} = require('./auxiliary_semantics');
const scorer = require('./score_completion_ckt_v4');
const model = require('./ckt_v4_model');
const ROOT = path.resolve(__dirname, '..');
const WEIGHTS = {character:1, word2:3, word3:1, word4:1};
const REF_POLICY = {keytao:{word2:'12',word3:'213',word4:'24'},sanpin:{word2:'12',word3:'213',word4:'23'}};
const POLICY26 = {keytao:{word2:'12',word3:'12',word4:'24'},sanpin:{word2:'12',word3:'21',word4:'13'}};
const BALANCE = {version:'soft-page-fill-v2',pageSize:6,maximumCandidates:120,minimumInputLength:4};
function read(p) { return JSON.parse(fs.readFileSync(p,'utf8')); }
function hash(x) { return crypto.createHash('sha256').update(x).digest('hex'); }
function signature(e) { return JSON.stringify([e.capacity,HEADS.map(h=>e.initialMap[h]),FINALS.map(f=>e.finalMap[f]),e.tone]); }
function rebuild(e,data) {
  return {...e,codeList:data.pinyin.map((py,i)=> {
    if (!e.codeList[i]) return null;
    const [h,f]=splitPinyin(py);
    return h===255||f===255 ? e.codeList[i] : e.initialMap[HEADS[h]]+e.finalMap[FINALS[f]];
  })};
}
function audit(e,data) {
  const first={},last={},codes=[];
  for(const [p] of data.base) {
    const [hi,fi]=splitPinyin(data.pinyin[p]);
    const h=HEADS[hi]==='YU'?'Y':HEADS[hi], f=FINALS[fi], c=e.codeList[p];
    if(typeof c!=='string'||! /^[A-Z]{2}$/.test(c)) return {valid:false};
    (first[h]??=new Set()).add(c[0]); (last[f]??=new Set()).add(c[1]); codes.push(c);
  }
  const links=Object.entries(first).filter(([h])=>!'AEO'.includes(h)).reduce((s,[h,ks])=>s+[...ks].filter(k=>h.toUpperCase()!==k).length,0)
    +new Set(['A','E','O'].flatMap(h=>[...(first[h]||[])])).size;
  const finals=Object.entries(last).reduce((s,[f,ks])=>s+[...ks].filter(k=>f.toUpperCase()!==k).length,0);
  const branches=[...Object.values(first),...Object.values(last)].reduce((s,ks)=>s+ks.size-1,0);
  const ordinary=HEADS.slice(0,21).filter(h=>h.length===1);
  const D=ordinary.filter(h=>first[h].size!==1||!first[h].has(h.toUpperCase())).length;
  const V=[...'aeiou'].filter(f=>!last[f]?.has(f.toUpperCase())).length;
  const reserved=new Set(e.tone), sound=[...new Set(codes.map(c=>c[0]))], rhyme=[...new Set(codes.map(c=>c[1]))];
  return {valid:sound.every(k=>!reserved.has(k))&&sound.length<=21&&rhyme.length<=e.capacity[1]&&(e.capacity[1]===26||rhyme.every(k=>!reserved.has(k))),M:links+finals+branches,D,V,branches,unique:new Set(codes).size,qz:codes.includes('QZ'),zq:codes.includes('ZQ')};
}
function movingHand(e,data,m) {
  const corpus=m.corpora.daily, variant=corpus.variants['native-punctuation'];
  const strokes=corpus.tokens.filter(t=>variant.includeFixedKeys||t.pinyin!=null).flatMap(t=>t.key!=null?[t.key.toUpperCase()]:[...e.codeList[t.pinyinIndex]]);
  const distance=(x0,y0,x1,y1)=> {
    if(y0>0)x0+=m.rowStagger.firstLowerRow+(y0-1)*m.rowStagger.perAdditionalRow;
    if(y1>0)x1+=m.rowStagger.firstLowerRow+(y1-1)*m.rowStagger.perAdditionalRow;
    return Math.hypot(x0-x1,y0-y1);
  };
  const positions=[[0,0],[0,0]]; let prev=m.initialPreviousColumn,time=0;
  for(const key of strokes) {
    const g=m.geometry[key], hand=Number(g.x>=5),same=hand===Number(prev>=5);
    const [px,py]=positions[hand]; positions[hand]=[g.x-g.finger,g.y-1];
    time+=(0.2+(same?distance(g.finger+px,1+py,g.x,g.y):0))/m.fingerSpeeds[g.finger];prev=g.x;
  }
  return {score:corpus.tokens.filter(t=>variant.includeFixedKeys||t.pinyin!=null).length/time*200,hits:strokes.length};
}
function ergonomics(e,data,fixture,motor) {
  const keys=[...HEADS.map(h=>e.initialMap[h]),...FINALS.map(f=>e.finalMap[f]),...e.tone];
  const lm=fixture.loadModel;
  const loads=lm.masses.map(row=> {
    const load={}; keys.forEach((k,i)=>load[k]=(load[k]||0)+row[i]);return load;
  });
  const sum=(load,letters)=>[...letters].reduce((s,k)=>s+(load[k]||0),0);
  const homes=loads.map(l=>sum(l,lm.homeKeys.join?lm.homeKeys.join(''):lm.homeKeys));
  const s2=lm.tracks.indexOf('S2');
  const mx=movingHand(e,data,fixture.movingHand);
  let cost=0,weight=0;
  for(const [p,w] of data.base) {cost+=w*motor(e.codeList[p]).upperMs;weight+=w;}
  return {mx:mx.score,hits:mx.hits,homeS2:homes[s2],homeFloor:Math.min(...homes),
    rpMax:Math.max(...loads.map(l=>sum(l,lm.rightPinkyKeys.join?lm.rightPinkyKeys.join(''):lm.rightPinkyKeys))),
    wMax:Math.max(...loads.map(l=>l.W||0)),yMax:Math.max(...loads.map(l=>l.Y||0)),motor:cost/weight};
}
function comfort(e,b) { return ['mx','homeS2','homeFloor'].every(k=>e.erg[k]>=b.erg[k]-1e-12); }
function legal(e,b) { const a=e.audit,z=b.audit;return a.valid&&!a.qz&&!a.zq&&a.M<=z.M&&a.D<=z.D&&a.V<=z.V&&a.branches<=z.branches&&a.unique>=z.unique; }
function variants(base) {
  const out=[];
  for(const field of ['initialMap','finalMap']) {
    const tokens=field==='initialMap'?HEADS:FINALS;
    for(let i=0;i<tokens.length;i++)for(let j=i+1;j<tokens.length;j++) {
      const a=tokens[i],b=tokens[j],ka=base[field][a],kb=base[field][b];if(ka===kb)continue;
      out.push({...base,[field]:{...base[field],[a]:kb,[b]:ka},mutation:`${field}:${a}(${ka})↔${b}(${kb})`});
    }
    const groups=Object.groupBy(tokens,t=>base[field][t]);
    const entries=Object.entries(groups);
    for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++) {
      const [ka,as]=entries[i],[kb,bs]=entries[j];if(as.length===1&&bs.length===1)continue;
      const map={...base[field]};as.forEach(t=>map[t]=kb);bs.forEach(t=>map[t]=ka);
      out.push({...base,[field]:map,mutation:`${field}:group ${as.join('/')}(${ka})↔${bs.join('/')}(${kb})`});
    }
  }
  // Move a whole zero-onset family together; avoids artificial Y/YU routes.
  for(const family of [['A','E','O'],['Y','YU'],['W'],['zh'],['ch'],['sh']])for(const k of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if(family.every(t=>base.initialMap[t]===k))continue;
    const map={...base.initialMap};family.forEach(t=>map[t]=k);
    out.push({...base,initialMap:map,mutation:`initialMap:${family.join('/')}→${k}`});
  }
  return out;
}
function makeContext(snow,html,fixturePath) {
  const {buildRowsForOrder}=require(path.join(snow,'scripts/research/evaluate_ckt_v4_word_aux_order.js'));
  const {buildExtendedWord3Rows,summarize}=require(path.join(snow,'scripts/research/evaluate_ckt51_aux_order.js'));
  const data=scorer.loadPayload(html), words=scorer.multiwords(path.join(snow,'snow_pinyin.base.dict.yaml'),data,0.99);
  const strokes=scorer.strokeOptions(path.join(snow,'rime-stroke/stroke.dict.yaml'));
  const snap=read(path.join(ROOT,'tools/ckt_v4_upstream_role_tables.json'));
  const motor=model.projectedMotor(model.upstreamMotor(snap),snap.keys,data.ckt.calibration.extension_maps);
  function evaluate(entry,policies) {
    const modes={};
    for(const mode of ['keytao','sanpin']) {
      const character=summarize(model.resolveCompetition(scorer.buildRows(entry,data,strokes,words,mode).filter(r=>r.kind==='character'),{motorCost:motor}));
      const rows=Object.fromEntries(Object.entries(policies[mode]).map(([kind,order])=>[kind,kind==='word3'&&entry.capacity[1]===21?buildExtendedWord3Rows(entry,data,words,mode,entry.tone,order):buildRowsForOrder(entry,data,words,mode,entry.tone,kind,order,model)]));
      if(entry.capacity[1]===21) {
        const pair=model.resolveCompetition([...rows.word2,...rows.word4],{motorCost:motor});
        modes[mode]={character,word2:summarize(pair.filter(r=>r.kind==='word2')),word4:summarize(pair.filter(r=>r.kind==='word4')),word3:summarize(model.resolveCompetition(rows.word3,{motorCost:motor}))};
      } else {
        const joint=model.resolveCompetition(Object.values(rows).flat(),{motorCost:motor,lengthBalance:BALANCE});
        modes[mode]={character,...Object.fromEntries(['word2','word3','word4'].map(k=>[k,summarize(joint.filter(r=>r.kind===k))]))};
      }
    }
    return modes;
  }
  const reference=evaluate(data.entries.find(e=>e.id==='S005'),REF_POLICY);
  function score(e) {
    const policies=e.capacity[1]===21?REF_POLICY:POLICY26,modes=evaluate(e,policies);
    let sum=0;for(const mode of Object.keys(modes))for(const [kind,w] of Object.entries(WEIGHTS))sum+=w*(modes[mode][kind].effectiveMs/reference[mode][kind].effectiveMs)**4;
    return {score:10*(sum/12)**.25,modes};
  }
  return {data,motor,fixture:read(fixturePath),score,words};
}
function decodeState(state,template) {
  const raw=Buffer.from(state,'hex');
  if(raw.length!==69)throw Error('invalid state');
  return {...template,capacity:[raw[0],raw[1]],initialMap:Object.fromEntries(HEADS.map((h,i)=>[h,ALPHABET[raw[i+2]]])),finalMap:Object.fromEntries(FINALS.map((f,i)=>[f,ALPHABET[raw[i+29]]])),tone:[...raw.subarray(64)].map(i=>ALPHABET[i]).join('')};
}
function main() {
  const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].slice(2)]=process.argv[i+1];
  const snow=path.resolve(args.snow||'D:/C2D/Documents/rime-snow-pinyin');
  const html=path.resolve(args.html||path.join(ROOT,'a7_CKT_R11.html'));
  const fixturePath=path.join(ROOT,'research/.cache/ckt-v4-ergonomics.json');
  const output=path.resolve(args.output||path.join(ROOT,'research/notes/2026-11-14-untoned-production-v51-descent.json'));
  const rounds=Number(args.rounds||2),retain=Number(args.retain||32);
  const ctx=makeContext(snow,html,fixturePath),{data,motor,fixture}=ctx;
  const report={version:'untoned-production-v51-descent-1',contract:{memory:'M-R2-explicit',common399DoubleEmpty:true,minimumUnique:'production baseline',maxMDV:'each production baseline',comfort:['daily native punctuation moving hand','S2 home','minimum of 20 frozen contract homes'],policy21:REF_POLICY,policy26:POLICY26,referencePolicy:REF_POLICY,lengthBalance26:BALANCE,trackWeights:WEIGHTS,rounds,retain,screen:'exact legality and frozen comfort, then top motor among strict, MX-only, and unrestricted groups; fixed production auxiliary policies'},sources:{htmlSha256:hash(fs.readFileSync(html)),ergonomicsSha256:hash(fs.readFileSync(fixturePath)),snowHead:cp.execFileSync('git',['-C',snow,'rev-parse','HEAD'],{encoding:'utf8'}).trim()},families:[]};
  const ids=args.only==='21'?['QZ-e8f37a0998f9']:['SNOW-SHENYUN-21X26-D3V1-BALANCED'];
  const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  for(const id of ids) {
    const template=data.entries.find(e=>e.id===id);if(!template)throw Error(`missing ${id}`);
    const prepare=e=> {const v=rebuild(e,data);v.audit=audit(v,data);v.erg=ergonomics(v,data,fixture,motor);return v;};
    const base=prepare({...template,mutation:'production baseline'});
    base.result=ctx.score(base);
    const expected=base.capacity[1]===21?9.56789806405906:9.10299979136027;
    if(Math.abs(base.result.score-expected)>1e-9)throw Error(`baseline score mismatch: ${base.result.score} expected ${expected}`);
    if(base.audit.M!==template.memoryAuditR2.M)throw Error('M-R2 baseline mismatch');
    const cachedMx=data['macroxue'].values[id]['daily|native-punctuation'].score;
    if(Math.abs(base.erg.mx-cachedMx)>1e-9)throw Error('moving hand baseline mismatch');
    const family={id,auxiliarySemantics:auxiliarySemantics(base.tone),baseline:{audit:base.audit,erg:base.erg,score:base.result.score},rounds:[],results:[]};
    report.families.push(family);
    const seen=new Set(),scored=new Map();
    const compact=e=>({id:e.id,mutation:e.mutation,parent:e.parent,audit:e.audit,erg:e.erg,score:e.result.score,strictComfort:comfort(e,base),initialMap:e.initialMap,finalMap:e.finalMap,toneKeysByTone:e.tone,capacity:e.capacity,modes:e.result.modes});
    scored.set(signature(base),base);family.results.push(compact(base));save();
    let seeds=[base];
    for(let round=0;round<rounds;round++) {
      let proposed=[];
      for(const seed of seeds)for(const raw of variants(seed)) {
        const key=signature(raw);if(seen.has(key)||scored.has(key))continue;seen.add(key);
        const e=rebuild(raw,data);e.audit=audit(e,data);if(!legal(e,base))continue;
        e.parent=seed.id;e.id=`UV51-${base.capacity[1]}-${hash(key).slice(0,12)}`;
        e.erg=ergonomics(e,data,fixture,motor);proposed.push(e);
      }
      if(round===0) {
        // Re-rank the published sibling frontier under the same native score.
        for(const entry of data.entries.filter(e=>e.id!==base.id&&e.capacity?.join('x')===base.capacity.join('x')&&e.initialMap&&e.finalMap&&e.tone===base.tone)) {
          const key=signature(entry);if(scored.has(key)||seen.has(key))continue;seen.add(key);
          const e=rebuild({...entry,mutation:`historical sibling ${entry.id}`,parent:base.id},data);
          if(data.base.some(([p])=>e.codeList[p]!==entry.codeList[p]))continue;
          e.audit=audit(e,data);
          if(legal(e,base)) {e.erg=ergonomics(e,data,fixture,motor);proposed.push(e);}
        }
        if(base.capacity[1]===26)for(const file of ['research/milestones/m40-d3/m40-d3-pareto-frontier-20261031.json','research/milestones/m40-d3-v2/m40-d3-v2-pareto-frontier-20261108.json']) {
          const archive=read(path.join(ROOT,file));
          for(const row of [...archive.top50Pareto,...archive.top20ParetoV0]) {
            const raw=decodeState(row.stateKey,base),key=signature(raw);if(seen.has(key)||scored.has(key))continue;seen.add(key);
            const e=rebuild(raw,data);e.audit=audit(e,data);if(!legal(e,base))continue;
            e.id=`ARCHIVE-${hash(key).slice(0,12)}`;e.mutation=`historical ${file} rank ${row.rank}`;e.parent=base.id;
            e.erg=ergonomics(e,data,fixture,motor);proposed.push(e);
          }
        }
      }
      const ranked=[...proposed].sort((a,b)=>a.erg.motor-b.erg.motor);
      const selected=[...new Map([...ranked.filter(e=>comfort(e,base)).slice(0,retain),...ranked.filter(e=>e.erg.mx>=base.erg.mx-1e-12).slice(0,retain),...ranked.slice(0,retain)].map(e=>[signature(e),e])).values()];
      family.rounds.push({round:round+1,legal:proposed.length,strict:proposed.filter(e=>comfort(e,base)).length,scored:selected.length,seeds:seeds.map(e=>e.id)});save();
      console.log(JSON.stringify({family:id,round:round+1,legal:proposed.length,selected:selected.length,baseline:base.result.score}));
      for(const e of selected) {
        e.result=ctx.score(e);scored.set(signature(e),e);family.results.push(compact(e));save();
        console.log(JSON.stringify({mutation:e.mutation,score:e.result.score,strict:comfort(e,base),mx:e.erg.mx,home:e.erg.homeFloor}));
      }
      const all=[...scored.values()].sort((a,b)=>a.result.score-b.result.score);
      seeds=[...new Map([...all.filter(e=>comfort(e,base)).slice(0,2),...all.filter(e=>e.erg.mx>=base.erg.mx-1e-12).slice(0,1),...all.slice(0,1)].map(e=>[signature(e),e])).values()];
    }
  }
  report.completed=true;
  save();
}
if(require.main===module)main();
module.exports={audit,rebuild,variants,comfort,legal,movingHand,ergonomics,makeContext,decodeState};
