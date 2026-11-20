'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {HEADS,FINALS,splitPinyin}=require('./ckt_v4_scheme_fixture'),{auxiliarySemantics}=require('./auxiliary_semantics');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const seedPath=path.join(ROOT,'research/notes/2026-11-20-untoned-frontiers-r11-scores-UED-18c004bd1f31.json'),seed=read(seedPath);
const policy={keytao:{word2:'12',word3:'231',word4:'24'},sanpin:{word2:'12',word3:'213',word4:'23'}};
assert.deepEqual(seed.policies,policy);
const priorPath=path.join(ROOT,'research/notes/2026-11-19-untoned-cr7e-v52-verification.json'),prior=read(priorPath);
const templates=path.join(ROOT,'research/.cache/untoned-cr7e-far-v52-20261120/templates.json');
const archive=path.join(ROOT,'research/config/u7e-fixed-gpu-templates.json.gz');
fs.writeFileSync(archive,zlib.gzipSync(fs.readFileSync(templates),{level:9}));
const config={version:'u7e-fixed-gpu-1',seedId:seed.id,initialMap:seed.initialMap,
 initialKeys:HEADS.map(h=>seed.initialMap[h].charCodeAt(0)-65),finalNames:FINALS,
 seedFinalKeys:FINALS.map(f=>seed.finalMap[f].charCodeAt(0)-65),allowedKeys:[...'BCDEFGHJKLMNPQRSTWXYZ'].map(k=>k.charCodeAt(0)-65),
 initialMemory:6,targetMemory:41,commonPairs:prior.auditInput.base.map(([p])=>splitPinyin(prior.auditInput.pinyin[p])),
 policies:policy,auxiliarySemantics:auxiliarySemantics('IVUAO'),seedModes:seed.v52.modes,referenceModes:seed.referenceModes,
 expectedSeedScores:[seed.v52.score,seed.doubledScore,read(path.join(ROOT,'research/notes/2026-11-20-untoned-u7r-cost3-comparison.json')).leaders.U7E.robust3x],
 templatesArchive:'research/config/u7e-fixed-gpu-templates.json.gz',templatesSha256:hash(templates),
 snapshot:'tools/ckt_v4_upstream_role_tables.json',profile:'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json',
 sourceHashes:Object.fromEntries([__filename,seedPath,priorPath,templates,archive,path.join(ROOT,'tools/auxiliary_semantics.js'),path.join(ROOT,'tools/ckt_v4_scheme_fixture.js')].map(p=>[path.relative(ROOT,p).replaceAll('\\','/'),hash(p)]))};
assert.equal(config.commonPairs.length,399);assert.ok(config.commonPairs.every(p=>p.every(i=>i!==255)));
fs.writeFileSync(path.join(ROOT,'research/config/u7e-fixed-gpu.json'),JSON.stringify(config,null,2)+'\n');
console.log(JSON.stringify({seed:config.seedId,expected:config.expectedSeedScores,archiveBytes:fs.statSync(archive).size}));
