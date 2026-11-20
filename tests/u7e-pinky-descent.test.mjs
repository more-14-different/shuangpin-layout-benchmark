import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {rightLoads}=require('../tools/explore_u7e_pinky_descent');
const {HEADS,FINALS}=require('../tools/ckt_v4_scheme_fixture');
test('pinky cap uses weighted expected keystrokes before division, and independent track peak',()=>{
 const initials=Object.fromEntries(HEADS.map(h=>[h,'B'])),finals=Object.fromEntries(FINALS.map(f=>[f,'C']));
 initials[HEADS[0]]='P';finals[FINALS[0]]='P';
 const mass=Array.from({length:2},()=>Array.from({length:4},()=>Array(62).fill(0)));
 for(let m=0;m<2;m++){mass[m][0][0]=1;mass[m][1][27]=.5;mass[m][2][1]=2;}
 const kinds=['character','word2','word3','word4'];
 const modes=Object.fromEntries(['keytao','sanpin'].map(m=>[m,Object.fromEntries(kinds.map((k,i)=>[k,{meanKeys:[2,4,3,4][i]}]))]));
 const result=rightLoads(finals,initials,modes,mass);
 assert.ok(Math.abs(result.mixed-2.5/21)<1e-15);
 assert.equal(result.peak,.5);
 assert.equal(result.byTrack['keytao/word2'],.125);
 assert.equal(result.byTrack['sanpin/word3'],0);
 assert.notEqual(result.mixed,(.5+3*.125)/6);
});
