'use strict';
const {layout,policies}=require('./anneal_2126_model');
const {neighbors}=require('./frontier_toned_2126');
const signature=s=>JSON.stringify([s.partition,s.maps,s.policy]);
function neighborhood(bundle,route,state){
 const result=new Map(),original=signature(state);
 const add=(s,move)=>{
  const key=signature(s);if(key===original||result.has(key))return;
  try{layout(bundle,route,s);}catch{return;}
  result.set(key,{state:s,move});
 };
 for(let a=0;a<state.partition.length;a++){
  for(let g=0;g<10;g++){
   const p=[...state.partition];p[a]=g;
   add({...state,partition:p},{kind:'root-transfer',root:a,group:g});
  }
  for(let b=a+1;b<state.partition.length;b++){
   const p=[...state.partition];[p[a],p[b]]=[p[b],p[a]];
   add({...state,partition:p},{kind:'root-swap',a,b});
  }
 }
 for(const n of neighbors(state.maps,false))add({...state,maps:n.maps},{kind:'group-key',...n.move});
 for(let policy=0;policy<policies.length;policy++)add({...state,policy},{kind:'policy',policy});
 return [...result.values()];
}
module.exports={neighborhood,signature};
