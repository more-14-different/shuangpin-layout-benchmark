'use strict';
const {HEADS,FINALS,splitPinyin}=require('./ckt_v4_scheme_fixture');
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
module.exports={rebuild,audit,movingHand,ergonomics};
