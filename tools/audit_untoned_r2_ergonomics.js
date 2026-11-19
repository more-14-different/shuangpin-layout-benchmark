'use strict';
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function independentAuditor(data) {
  const replay=path.join(ROOT,'research/.cache/R11_integrated_replay');
  require(path.join(replay,'script1.js'));require(path.join(replay,'script2.js'));
  Engine7.init(data);CKTEngine.init(data);
  const specs=read(path.join(replay,'track_options.json'));
  return entry=> {
    const tracks={};
    for(const [name,spec] of Object.entries(specs)) {
      const opt={...spec,model:'ckt',confirm:0,uniform:false,cohort:'common',boundary:'none'};
      const z=CKTEngine.evaluate({...entry,id:`closure-audit:${entry.id}`},opt,false);
      const aggregate=Engine7.aggregate(Engine7.rowsFor(entry,opt),{...opt,boundary:'iid'});
      const e34=Engine7.project(aggregate,Engine7.costs('e34'));
      const geo=Engine7.project(aggregate,Engine7.costs('geometry'));
      tracks[name]={home:z.home,sfb:z.sfb,maxFinger:z.maxFinger,rightPinky:z.rightPinky,upperMs:z.upperMs,e34:e34.eq,geometry:geo.eq};
    }
    let e4=0,e5=0;const c=data.ensembleV4;
    for(const [name,w] of Object.entries(c.trackWeights))for(const model of ['e34','geometry'])e4+=w*.5*(tracks[name][model]/c.baselines[`${name}|${model}`])**c.beta;
    for(const [name,w] of Object.entries(data.ensembleV5.trackWeights))e5+=w*(tracks[name].upperMs/data.ensembleV5.baselines[name])**4;
    return {a7eV4:10*e4**(1/c.beta),a7eV5:10*e5**.25,tracks};
  };
}
module.exports={independentAuditor};
