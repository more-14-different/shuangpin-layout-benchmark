'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const source=path.join(ROOT,'research/.cache/R11_integrated_replay/source.json');
const full=JSON.parse(fs.readFileSync(source,'utf8'));
const entries=JSON.parse(fs.readFileSync(path.join(ROOT,'research/config/um40-r11-entries.json'),'utf8'));
const pick=e=>Object.fromEntries(['id','name','capacity','tone','codeList','initialMap','finalMap'].map(k=>[k,e[k]]));
const data={pinyin:full.pinyin,base:full.base,characters:full.characters,shapes:{snowshape:full.shapes.snowshape},
  ckt:{calibration:{extension_maps:full.ckt.calibration.extension_maps}},
  entries:[pick(full.entries.find(e=>e.id==='S005')),...entries.map(pick)],
  frozenReplaySha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex')};
const output=path.join(ROOT,'research/.cache/um40-v52-compact-input.json');
fs.writeFileSync(output,JSON.stringify(data));
console.log(JSON.stringify({output,bytes:fs.statSync(output).size}));
