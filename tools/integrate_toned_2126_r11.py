"""Publish the two frozen 21x26 toned representatives alongside existing toned contracts."""
import json
import hashlib
import subprocess
from pathlib import Path
from integrate_snow_jiandao_toned_r11 import ROOT, HTML, SNOW, macro_replay, patch_report, patch_selectable_ui
from shenyun_collision_benchmark import read_word_corpus, evaluate_toned_layout

DEST=ROOT/'a7_CKT_R11_integrated_materials/toned2126'

def main():
    dest_payload=DEST/'payload.json'
    unpack="const fs=require('fs'),z=require('zlib');const s=fs.readFileSync('a7_CKT_R11.html','utf8'),a=s.indexOf('<script id=\"payload\"'),b=s.indexOf('>',a)+1,e=s.indexOf('</script>',b);fs.writeFileSync(process.argv[1],z.gunzipSync(Buffer.from(s.slice(b,e),'base64')));"
    subprocess.run(['node','-e',unpack,str(dest_payload)],cwd=ROOT,check=True)
    data=json.loads(dest_payload.read_text(encoding='utf8'))
    corpus=read_word_corpus([SNOW/n for n in ['snow_pinyin.base.dict.yaml','snow_pinyin.ext.dict.yaml','snow_pinyin.tencent.dict.yaml']],allowed_pinyin={data['pinyin'][i] for i,_ in data['base']},preserve_tones=True)
    audit={}
    for which in ['keep','26']:
        raw=json.loads((DEST/(which+'.json')).read_text(encoding='utf8'))
        native,fixture=raw['native'],raw['fixture']
        native['columns']=json.loads((DEST/(which+'.columns.json')).read_text(encoding='utf8'))
        code_hash=hashlib.sha256(json.dumps(native['tonedCodes'],separators=(',',':')).encode()).hexdigest()
        if native['columns']['tonedCodesSha256']!=code_hash:raise ValueError('stale benchmark columns')
        native['columns']['collision']=evaluate_toned_layout(fixture,corpus)
        native['macro']=macro_replay(data,fixture)
        data['tonedContractBenchmark']['schemes'].setdefault('research',{})[native['id']]=native
        audit[native['id']]={k:v for k,v in native.items() if k not in ['tonedCodes','filterRows','keyboards']}
        print(native['id'],native['ckt']['v51']['score'],native['macro']['daily|native-punctuation']['score'],flush=True)
    (ROOT/'research/notes/2026-11-14-toned-2126-r11-benchmark.json').write_text(json.dumps({'version':1,'schemes':audit},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    ui=patch_selectable_ui(patch_report(HTML.read_text(encoding='utf8')))
    (DEST/'ui.html').write_text(ui,encoding='utf8')
    with dest_payload.open('w',encoding='utf8') as f:json.dump(data,f,ensure_ascii=False,separators=(',',':'))
    # Preserve original ignored artifact for local rollback before atomic replacement.
    backup=DEST/'before.html'
    if not backup.exists():backup.write_bytes(HTML.read_bytes())
    pack="const fs=require('fs'),z=require('zlib');const [ui,payload,out]=process.argv.slice(1),s=fs.readFileSync(ui,'utf8'),a=s.indexOf('<script id=\"payload\"'),b=s.indexOf('>',a)+1,e=s.indexOf('</script>',b);fs.writeFileSync(out,s.slice(0,b)+z.gzipSync(fs.readFileSync(payload),{mtime:0}).toString('base64')+s.slice(e));"
    tmp=HTML.with_suffix('.html.tmp')
    subprocess.run(['node','-e',pack,str(DEST/'ui.html'),str(dest_payload),str(tmp)],cwd=ROOT,check=True)
    tmp.replace(HTML)

if __name__=='__main__':main()
