'use strict';
// Shared wire representation only; all UI/scoring callers retain six-column rows.
function restoreTonedFilterPayload(data) {
 const pool=data.tonedFilterRowPool;
 if(!pool)return data;
 if(pool.version!==1||!Array.isArray(pool.rows))throw new Error('Unknown toned filter pool');
 const schemes=data.tonedContractBenchmark?.schemes||{};
 const natives=[schemes.snowJiandao,...Object.values(schemes.research||{})].filter(Boolean);
 for(const native of natives){
  const packed=native.filterRowsPacked;if(!packed)continue;
  if(packed.version!==1||native.filterRows)throw new Error('Invalid toned filter encoding');
  const rows=packed.rows.map(row=>{
   if(!Number.isInteger(row[0])||row[0]<0||row[0]>=pool.rows.length||row.length!==3)throw new Error('Invalid toned filter reference');
   const [text,reading,weight,kind]=pool.rows[row[0]];
   return [text,reading,row[1],row[2],weight,kind];
  });
  native.filterRows=rows;delete native.filterRowsPacked;
 }
 delete data.tonedFilterRowPool;return data;
}
if(typeof module!=='undefined')module.exports={restoreTonedFilterPayload};
