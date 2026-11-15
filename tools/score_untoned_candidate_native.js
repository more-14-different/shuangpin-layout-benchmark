'use strict';
const fs=require('node:fs');
const search=require('./search_untoned_production_v51');
const stream=require('./untoned_v51_stream');
const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>i%2?a:[...a,[v.slice(2),all[i+1]]],[]));
const ctx=search.makeContext(args.snow,args.html,args.fixture);
const entry=ctx.data.entries.find(e=>e.id===args.id);if(!entry)throw Error('Missing candidate');
const native=ctx.score(entry),review=JSON.parse(fs.readFileSync(args.review,'utf8'));
const expected=review.results.find(r=>r.id===args.id);if(!expected)throw Error('Missing audited score');
const maximumAbsoluteDifference=stream.compare(native,expected);
const aggregate={};const weights={character:1,word2:3,word3:1,word4:1};
for(const field of ['motorUpperMs','effectiveMs','firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanRejectedCandidates','meanPageActions','meanKeys']){let sum=0;for(const mode of ['keytao','sanpin'])for(const[kind,w]of Object.entries(weights))sum+=w*native.modes[mode][kind][field];aggregate[field]=sum/12;}
aggregate.cognitiveMs=aggregate.effectiveMs-aggregate.motorUpperMs;
const policies={candidate:{keytao:{word2:'12',word3:'12',word4:'24'},sanpin:{word2:'12',word3:'21',word4:'13'}},reference:{keytao:{word2:'12',word3:'213',word4:'24'},sanpin:{word2:'12',word3:'213',word4:'23'}}};
fs.writeFileSync(args.output,JSON.stringify({...native,aggregate,policies,maximumAbsoluteDifference,balanceContract:'soft-page-fill-v2'},null,2)+'\n');
console.log(JSON.stringify({id:entry.id,score:native.score,maximumAbsoluteDifference}));
