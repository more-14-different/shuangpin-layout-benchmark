'use strict';
const fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto');
// Large raw search JSON is a local cache; the committed gzip preserves its exact bytes.
function bytes(p){return fs.existsSync(p)?fs.readFileSync(p):zlib.gunzipSync(fs.readFileSync(p+'.gz'));}
const read=p=>JSON.parse(bytes(p).toString('utf8'));
const hash=p=>crypto.createHash('sha256').update(bytes(p)).digest('hex');
module.exports={read,hash};
