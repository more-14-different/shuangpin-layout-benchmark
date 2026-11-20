'use strict';
// Single-code five/six-key residual paths. Numeric buckets preserve stable
// frequency/ID order and the original 120-candidate, six-slot length balancing.
const assert=require('node:assert/strict');
const KINDS=['word2','word3','word4'];
const FIELDS=['motorUpperMs','firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanRejectedCandidates','meanPageActions','meanKeys'];
function balanced(input,groups){
  let mask=0;for(const i of input)mask|=1<<groups[i];
  if((mask&(mask-1))===0)return input;
  const output=[];
  for(let offset=0;offset<input.length;offset+=120){
    let remaining=input.slice(offset,offset+120);
    while(remaining.length){
      const n=Math.min(6,remaining.length),available=[0,0,0],targets=[0,0,0],counts=[0,0,0];
      for(const i of remaining)available[groups[i]]++;
      for(let j=0;j<n;j++){
        let selected=-1;
        for(let g=0;g<3;g++)if(targets[g]<available[g]&&(selected<0||targets[g]<targets[selected]))selected=g;
        targets[selected]++;
      }
      const chosen=new Uint8Array(remaining.length);chosen.fill(1,0,n);
      for(let j=0;j<n;j++)counts[groups[remaining[j]]]++;
      for(let needed=0;needed<3;needed++)while(counts[needed]<targets[needed]){
        let replacement=-1,displaced=-1;
        for(let j=n;j<remaining.length;j++)if(!chosen[j]&&groups[remaining[j]]===needed){replacement=j;break;}
        if(replacement<0)break;
        for(let j=n-1;j>=0;j--)if(chosen[j]&&counts[groups[remaining[j]]]>targets[groups[remaining[j]]]){displaced=j;break;}
        if(displaced<0)break;
        chosen[displaced]=0;chosen[replacement]=1;counts[groups[remaining[displaced]]]--;counts[needed]++;
      }
      const next=[];
      for(let j=0;j<remaining.length;j++)if(chosen[j])output.push(remaining[j]);else next.push(remaining[j]);
      remaining=next;
    }
  }
  return output;
}
function packed(code){let value=0;for(let i=0;i<code.length;i++)value=value*32+code.charCodeAt(i)-65;return value;}
function prepare(tails,ctx){
  const starts=[],metadata=[],variants={};let size=0;
  for(let kind=0;kind<3;kind++){
    const name=KINDS[kind],first=tails[name].values().next().value;starts[kind]=size;
    for(const r of first){assert.equal(r.baseLength,4);metadata.push({id:r.id,kind,weight:r.weight,group:Math.min([...r.text].length,4)-2});size++;}
    variants[name]=new Map();
    for(const [order,rows]of tails[name]){
      const key5=new Uint32Array(rows.length),key6=new Uint32Array(rows.length),motor5=new Float64Array(rows.length),motor6=new Float64Array(rows.length);
      rows.forEach((r,i)=>{
        assert.equal(r.id,first[i].id);assert.equal(r.stages.length,2);
        for(let j=0;j<2;j++)assert.ok(r.stages[j].length===5+j&&r.stages[j].codes.length===1);
        const c5=r.stages[0].codes[0],c6=r.stages[1].codes[0];
        key5[i]=packed(c5);key6[i]=packed(c6);motor5[i]=ctx.next(c5).upperMs;motor6[i]=ctx.next(c6).upperMs;
      });
      variants[name].set(order,{key5,key6,motor5,motor6});
    }
  }
  const groups=metadata.map(r=>r.group),priority=Array.from({length:size},(_,i)=>i).sort((i,j)=>metadata[j].weight-metadata[i].weight||(metadata[i].id<metadata[j].id?-1:metadata[i].id>metadata[j].id?1:0));
  const counts=[0,0,0],weights=[0,0,0];for(const r of metadata){counts[r.kind]++;weights[r.kind]+=r.weight;}
  return function resolve(policy){
    const key5=new Uint32Array(size),key6=new Uint32Array(size),motor5=new Float64Array(size),motor6=new Float64Array(size);
    for(let k=0;k<3;k++){
      const v=variants[KINDS[k]].get(policy[KINDS[k]]),start=starts[k];
      key5.set(v.key5,start);key6.set(v.key6,start);motor5.set(v.motor5,start);motor6.set(v.motor6,start);
    }
    const lengths=new Uint8Array(size),ranks=new Uint32Array(size),first=new Map(),last=new Map();
    for(const i of priority){const key=key5[i];if(!first.has(key))first.set(key,[]);first.get(key).push(i);}
    for(const input of first.values()){const winner=balanced(input,groups)[0];lengths[winner]=5;ranks[winner]=1;}
    for(const i of priority)if(!lengths[i]){const key=key6[i];if(!last.has(key))last.set(key,[]);last.get(key).push(i);}
    for(const input of last.values()){
      const order=balanced(input,groups);for(let j=0;j<order.length;j++){lengths[order[j]]=6;ranks[order[j]]=j+1;}
    }
    const totals=Array.from({length:3},()=>new Float64Array(8));
    metadata.forEach((r,i)=>{
      const t=totals[r.kind],w=r.weight,rank=ranks[i];assert.ok(rank>0);
      t[0]+=w*(lengths[i]===5?motor5[i]:motor6[i]);t[1]+=w;t[2]+=w*(lengths[i]===6);
      t[4]+=w*(rank>1);t[5]+=w*(rank-1);t[6]+=w*Math.floor((rank-1)/6);t[7]+=w*lengths[i];
    });
    return Object.fromEntries(KINDS.map((kind,k)=>{
      const out={count:counts[k],totalWeight:weights[k],...Object.fromEntries(FIELDS.map((f,j)=>[f,totals[k][j]/weights[k]]))};
      out.effectiveMs=out.motorUpperMs+300*out.firstAuxRate+300*out.secondAuxRate+300*out.thirdAuxRate+600*out.selectionRate+50*out.meanRejectedCandidates+300*out.meanPageActions;
      return [kind,out];
    }));
  };
}
module.exports={balanced,packed,prepare};
