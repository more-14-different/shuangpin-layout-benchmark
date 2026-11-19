'use strict';
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
const entries={
 R1:{id:'T2126-V52-M4-a38a5f3fb250',name:'21×26 带调 · R1 默认精修 10/9/7',source:'research/notes/2026-11-19-toned-2126-v52-m4-refine-finalists.json',sourceId:'T2126-V52-M4-a38a5f3fb250',policy:['12','12','24'],score:8.632424839489946,doubleScore:8.248047262079616,description:'A/E/O统一零声母载体R；er并入a/n/ong组。默认CKT5.2目标，辅序12/12/24。'},
 R2:{id:'T2126-V52-M4-ec60a3637a99',name:'21×26 带调 · R2 加倍成本精修 10/9/7',source:'research/notes/2026-11-19-toned-2126-v52-m4-refine-finalists.json',sourceId:'T2126-V52-M4-ec60a3637a99',policy:['21','12','23'],score:8.640932204060537,doubleScore:8.234488645251973,description:'A/E/O统一零声母载体R；加倍认知成本目标，辅序21/12/23。'},
 C1:{id:'T2126-V52-R1-bf064ef92931',name:'21×26 带调 · C1 最新联动精修 10/9/7',source:'research/notes/2026-11-19-toned-2126-v52-r1-coupled-finalists.json',sourceId:'T2126-V52-R1-bf064ef92931',policy:['12','12','23'],score:8.627569387856402,doubleScore:8.246403482637035,description:'R1联动后继：A/E/O统一零声母载体R→N，er从a/n/ong组移入ang/ei组；韵键位置不变，辅序12/12/23。'},
};
function load(key){
 const spec=entries[key];assert.ok(spec,'unknown representative '+key);
 const source=JSON.parse(fs.readFileSync(path.join(ROOT,spec.source),'utf8'));
 const layout=source.layouts.find(l=>l.id===spec.sourceId&&l.policy.join('/')===spec.policy.join('/'));assert.ok(layout);
 assert.deepEqual(layout.policy,spec.policy);assert.ok(Math.abs(layout.score-spec.score)<1e-9);
 return {...spec,key,sourcePath:path.join(ROOT,spec.source),source,layout,policy:Object.fromEntries(['word2','word3','word4'].map((k,i)=>[k,spec.policy[i]]))};
}
module.exports={ROOT,entries,load};
