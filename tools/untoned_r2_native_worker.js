'use strict';
const path=require('node:path'),{spawn}=require('node:child_process'),readline=require('node:readline'),assert=require('node:assert/strict');
function launch(root=path.resolve(__dirname,'..')){
 const child=spawn(path.join(root,'research/ckt-v4-core/target/release/score-untoned-r2-v52-stream.exe'),[path.join(root,'research/.cache/untoned-r2-v52-templates.json'),path.join(root,'tools/ckt_v4_upstream_role_tables.json'),path.join(root,'research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json')],{windowsHide:true,stdio:['pipe','pipe','inherit']});
 let pending,resolveReady,rejectReady;
 const ready=new Promise((r,j)=>{resolveReady=r;rejectReady=j});
 const fail=e=>{rejectReady(e);pending?.reject(e);pending=null;};
 readline.createInterface({input:child.stdout}).on('line',line=>{try{const v=JSON.parse(line);if(v.ready)resolveReady(v);else{assert.ok(pending,'unsolicited score');const p=pending;pending=null;p.resolve(v);}}catch(e){fail(e);}});
 child.on('error',fail);child.on('exit',code=>{if(code||pending)fail(Error(`worker exit ${code}`));});
 return {ready,score:request=>new Promise((resolve,reject)=>{assert.ok(!pending,'worker busy');pending={resolve,reject};child.stdin.write(JSON.stringify(request)+'\n');}),close:()=>child.stdin.end()};
}
module.exports={launch};
