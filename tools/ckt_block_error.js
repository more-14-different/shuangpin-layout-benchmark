'use strict';
const {upstreamMotor}=require('./ckt_v4_model');
const {snapshotFingerprint}=require('./ckt_long_continuation');

// Separate research scenario: keep the four-key prefix and compose tail success.
function blockErrorMotor(snapshot,profile,{tailMode='block'}={}) {
  if(!['block','sequential'].includes(tailMode))throw Error('invalid tailMode');
  if(profile.version!=='ckt-long-error-profile-v1'||profile.keys!==snapshot.keys||
    profile.snapshotFingerprint!==snapshotFingerprint(snapshot)||profile.errorRecoveryMs!==snapshot.errorRecoveryMs)
    throw Error('error profile does not match frozen snapshot');
  const size=snapshot.keys.length,index=Object.fromEntries([...snapshot.keys].map((k,i)=>[k,i])),tables={};
  for(const role of snapshot.roles) {
    const dimensions=role==='L2i1'?2:role==='L4i2'?4:3,spec=profile.errorTables[role];
    if(!spec)throw Error('missing error table '+role);
    const bytes=Buffer.from(spec.base64,'base64');
    if(bytes.length!==4*size**dimensions||spec.shape.length!==dimensions||spec.shape.some(n=>n!==size))
      throw Error('invalid error table '+role);
    const a=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    if(a.some(p=>!Number.isFinite(p)||p<0||p>1))throw Error('invalid error probability '+role);
    tables[role]=a;
  }
  const legacy=upstreamMotor(snapshot);
  function at(role,code) {
    let offset=0;for(const key of code)offset=offset*size+index[key];return tables[role][offset];
  }
  function short(code) {
    const h=code.length===2?[at('L2i1',code)]:code.length===3?
      [at('L3i1',code),at('L3i2',code)]:
      [at('L4i1',code.slice(0,3)),at('L4i2',code),at('L4i3',code.slice(1))];
    const success=h.reduce((s,p)=>s*(1-p),1);
    return {success,errorProbability:1-success,errorSum:h.reduce((s,p)=>s+p,0)};
  }
  function risk(code) {
    if(typeof code!=='string'||code.length<2||code.length>6||[...code].some(k=>index[k]===undefined))
      throw Error('block risk requires two to six native physical keys');
    if(code.length<=4)return short(code);
    const prefix=short(code.slice(0,4)),tail=code.slice(3);
    let tailSuccess=short(tail).success;
    if(tailMode==='sequential'&&tail.length===3)
      tailSuccess=short(tail.slice(0,2)).success*(1-at('L3i2',tail));
    const incrementalErrorProbability=prefix.success*(1-tailSuccess);
    return {success:prefix.success*tailSuccess,errorProbability:1-prefix.success*tailSuccess,
      prefixErrorProbability:prefix.errorProbability,tailErrorProbability:1-tailSuccess,
      incrementalErrorProbability,anchoredErrorSum:prefix.errorSum+incrementalErrorProbability,
      prefixErrorSum:prefix.errorSum};
  }
  function motor(code) {
    if(code.length>6)throw Error('block continuation supports at most six keys');
    const base=legacy(code);
    if(!base||code.length<=4)return base;
    const r=risk(code);
    let oldErrorSum=at('L4i1',code.slice(0,3))+at('L4i3',code.slice(-3));
    for(let i=0;i<=code.length-4;i++)oldErrorSum+=at('L4i2',code.slice(i,i+4));
    // Anchor the frozen four-key SUM-of-hazards cost. Charge only the new
    // first-error risk mass; don't mix a product-based prefix with its old cost.
    const errorCorrectionMs=profile.errorRecoveryMs*(r.anchoredErrorSum-oldErrorSum);
    return {...base,upperMs:base.upperMs+errorCorrectionMs,legacyUpperMs:base.upperMs,
      ...r,errorCorrectionMs,oldErrorSum,
      inferredTimingMs:base.upperMs-profile.errorRecoveryMs*oldErrorSum,
      anchoredErrorCostMs:profile.errorRecoveryMs*r.anchoredErrorSum,
      continuationModel:'four-prefix-tail-success-v1',tailMode};
  }
  motor.risk=risk;
  motor.costBounds=()=>{
    const decode=role=>{const bytes=Buffer.from(snapshot.tables[role].base64,'base64');
      return new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))};
    const middle=decode('L4i2'),last=decode('L4i3'),recovery=profile.errorRecoveryMs,cube=size**3;
    let minimumTimingIncrement=Infinity,timingContext=null,minimumTailRiskIncrement=Infinity,tailContext=null,tailRiskDrops=0;
    const codeAt=(n,length)=>{let code='';for(let j=0;j<length;j++){code=snapshot.keys[n%size]+code;n=Math.floor(n/size)}return code};
    for(let i=0;i<middle.length;i++) {
      const late=i%cube,early=Math.floor(i/size);
      const delta=(middle[i]-recovery*tables.L4i2[i])+
        (last[late]-recovery*tables.L4i3[late])-(last[early]-recovery*tables.L4i3[early]);
      if(delta<minimumTimingIncrement){minimumTimingIncrement=delta;timingContext=codeAt(i,4)}
    }
    for(let i=0;i<tables.L3i1.length;i++) {
      const delta=(1-tables.L2i1[Math.floor(i/size)])-(1-tables.L3i1[i])*(1-tables.L3i2[i]);
      tailRiskDrops+=delta<0;
      if(delta<minimumTailRiskIncrement){minimumTailRiskIncrement=delta;tailContext=codeAt(i,3)}
    }
    // P6-P5 = S4 * (P3_tail-P2_tail), and 0 <= S4 <= 1.
    const fiveToSixLowerBound=minimumTimingIncrement+recovery*Math.min(0,minimumTailRiskIncrement);
    return {contextsChecked:middle.length,tailContextsChecked:tables.L3i1.length,tailRiskDrops,
      minimumTimingIncrementMs:minimumTimingIncrement,timingContext,
      minimumTailRiskIncrement,tailContext,fourToFiveCostLowerBoundMs:minimumTimingIncrement,
      fiveToSixCostLowerBoundMs:tailMode==='block'?fiveToSixLowerBound:minimumTimingIncrement,
      certifiesNondecreasingCost:minimumTimingIncrement>=0&&(tailMode==='sequential'||fiveToSixLowerBound>=0)};
  };
  return motor;
}
module.exports={blockErrorMotor};
