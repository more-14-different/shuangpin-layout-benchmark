import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import payload from '../tools/toned_filter_payload.js';
test('Python wire compaction and Node/browser restoration are lossless and idempotent',()=>{
 const rows=[['你好','ni3 hao3','ABCD','ABCDE',17,'word2'],['甲','jia0','BA','BAAE',4,'character']];
 const original={tonedContractBenchmark:{schemes:{snowJiandao:{filterRows:rows},research:{a:{filterRows:[rows[0],['你好','ni3 hao3','XYZW','XYZWA',17,'word2']]}}}}};
 const script="import sys,json;sys.path.insert(0,'tools');from toned_filter_payload import compact,restore;d=json.load(sys.stdin);before=json.dumps(d);compact(d);wire=json.dumps(d);restore(d);assert json.dumps(d)==before;print(wire)";
 const wire=JSON.parse(execFileSync('python',['-X','utf8','-c',script],{input:JSON.stringify(original),encoding:'utf8'}));
 assert.equal(wire.tonedFilterRowPool.rows.length,2);
 assert.equal(wire.tonedContractBenchmark.schemes.research.a.filterRowsPacked.rows.length,2);
 assert.deepEqual(payload.restoreTonedFilterPayload(wire),original);
 assert.deepEqual(payload.restoreTonedFilterPayload(wire),original);
});
test('invalid references fail instead of silently corrupting filter rows',()=>{
 const d={tonedFilterRowPool:{version:1,rows:[]},tonedContractBenchmark:{schemes:{snowJiandao:{filterRowsPacked:{version:1,rows:[[0,'A','AA']]}}}}};
 assert.throws(()=>payload.restoreTonedFilterPayload(d),/reference/);
});
