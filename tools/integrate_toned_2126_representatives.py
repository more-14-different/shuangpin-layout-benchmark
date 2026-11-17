"""Publish six scored toned 21x26 representatives, preserving other R11 payload rows and UI."""
import argparse,hashlib,json,subprocess
from pathlib import Path
from integrate_snow_jiandao_toned_r11 import ROOT,SNOW,macro_replay
from shenyun_collision_benchmark import read_word_corpus,evaluate_toned_layout
from toned_filter_payload import restore,compact

DEST=ROOT/'a7_CKT_R11_integrated_materials/toned2126'
MARKER='/* TONED_2126_ROBUST_PUBLICATION_V1 */'
END='/* TONED_2126_ROBUST_PUBLICATION_V1_END */'

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--html',type=Path,default=ROOT/'a7_CKT_R11.html')
    args=p.parse_args();target=args.html.resolve()
    before=hashlib.sha256(target.read_bytes()).hexdigest()
    routes=json.loads(subprocess.check_output(['node','-e',"console.log(JSON.stringify(Object.keys(require('./tools/toned_2126_publication_catalog').entries)))"],cwd=ROOT))
    raw_payload=DEST/'representatives-payload.json'
    unpack="const fs=require('fs'),z=require('zlib');const [f,out]=process.argv.slice(1),s=fs.readFileSync(f,'utf8'),a=s.indexOf('<script id=\"payload\"'),b=s.indexOf('>',a)+1,e=s.indexOf('</script>',b);fs.writeFileSync(out,z.gunzipSync(Buffer.from(s.slice(b,e),'base64')));"
    subprocess.run(['node','--max-old-space-size=8192','-e',unpack,str(target),str(raw_payload)],cwd=ROOT,check=True)
    data=restore(json.loads(raw_payload.read_text(encoding='utf8')))
    schemes=data['tonedContractBenchmark']['schemes'].setdefault('research',{})
    untouched={k:hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':')).encode()).hexdigest() for k,v in schemes.items()}
    corpus=read_word_corpus([SNOW/n for n in ['snow_pinyin.base.dict.yaml','snow_pinyin.ext.dict.yaml','snow_pinyin.tencent.dict.yaml']],allowed_pinyin={data['pinyin'][i] for i,_ in data['base']},preserve_tones=True)
    audit={}
    for route in routes:
        raw=json.loads((DEST/(route+'.json')).read_text(encoding='utf8'));native,fixture=raw['native'],raw['fixture']
        columns=json.loads((DEST/(route+'.columns.json')).read_text(encoding='utf8'))
        if columns['version']!='tone-in-main-column-contracts-v3':raise ValueError('stale columns')
        code_hash=hashlib.sha256(json.dumps(native['tonedCodes'],separators=(',',':')).encode()).hexdigest()
        if columns['tonedCodesSha256']!=code_hash or columns['nativeId']!=native['id']:raise ValueError('column/code mismatch')
        if native['memory']['audit']['version']!='M-T1-derived-v1':raise ValueError('missing memory ledger')
        if data['pinyin']!=fixture['pinyin']:raise ValueError('publication pinyin inventory changed')
        native['columns']=columns;native['columns']['collision']=evaluate_toned_layout(fixture,corpus)
        native['macro']=macro_replay(data,fixture)
        native['publication']['benchmarkComputedForPolicy']=native['contract']['wordAuxiliaryPolicy']
        schemes[native['id']]=native
        audit[native['id']]={k:v for k,v in native.items() if k not in {'tonedCodes','filterRows','keyboards'}}
        print(json.dumps(dict(id=native['id'],policy=native['contract']['wordAuxiliaryPolicy'],score=native['ckt']['v51']['score'],daily=native['macro']['daily|native-punctuation']['score'],memory=[native['memory']['lower'],native['memory']['guard']]),ensure_ascii=False),flush=True)
    for k,h in untouched.items():
        if k not in audit and hashlib.sha256(json.dumps(schemes[k],sort_keys=True,separators=(',',':')).encode()).hexdigest()!=h:raise ValueError('unrelated scheme modified: '+k)
    source=(ROOT/'tools/toned_2126_robustness_ui.js').read_text(encoding='utf8')
    ui=target.read_text(encoding='utf8')
    if MARKER in ui:
        start=ui.index(MARKER);end=ui.index(END,start)+len(END);ui=ui[:start]+source+ui[end:]
    else:
        anchor='/* SNOW_JIANDAO_SELECTABLE_V1_END */'
        if anchor not in ui:raise ValueError('toned contract UI not installed')
        ui=ui.replace(anchor,source+'\n'+anchor,1)
    # Refresh only the shared keyboard renderer; preserve other agents' UI hooks.
    keyboard=(ROOT/'tools/snow_jiandao_toned_ui.js').read_text(encoding='utf8')
    function_start='function snowJiandaoKeyboardSVG('
    function_end='function snowJiandaoFilterState('
    start=ui.index(function_start);end=ui.index(function_end,start)
    ui=ui[:start]+keyboard[keyboard.index(function_start):keyboard.index(function_end)]+ui[end:]
    ui_stage=DEST/'representatives-ui.html'
    pool_source=(ROOT/'tools/toned_filter_payload.js').read_text(encoding='utf8')
    start_marker='<script id="toned-filter-payload-decoder">'
    if start_marker in ui:
        begin=ui.index(start_marker);end=ui.index('</script>',begin)+len('</script>')
        ui=ui[:begin]+start_marker+pool_source+'</script>'+ui[end:]
    else:ui=ui.replace('<script id="payload"',start_marker+pool_source+'</script><script id="payload"',1)
    if 'uxBoot(restoreTonedFilterPayload(data));' not in ui:
        if 'uxBoot(data);' not in ui:raise ValueError('missing UI boot anchor')
        ui=ui.replace('uxBoot(data);','uxBoot(restoreTonedFilterPayload(data));',1)
    ui_stage.write_text(ui,encoding='utf8')
    packing=compact(data)
    with raw_payload.open('w',encoding='utf8') as f:json.dump(data,f,ensure_ascii=False,separators=(',',':'))
    payload_bytes=raw_payload.stat().st_size
    if payload_bytes>=500_000_000:raise ValueError('payload exceeds conservative JS string budget')
    pack="const fs=require('fs'),z=require('zlib');const [ui,payload,out]=process.argv.slice(1),s=fs.readFileSync(ui,'utf8'),a=s.indexOf('<script id=\"payload\"'),b=s.indexOf('>',a)+1,e=s.indexOf('</script>',b);fs.writeFileSync(out,s.slice(0,b)+z.gzipSync(fs.readFileSync(payload),{mtime:0}).toString('base64')+s.slice(e));"
    stage=target.with_name(target.name+'.representatives.tmp')
    subprocess.run(['node','--max-old-space-size=8192','-e',pack,str(ui_stage),str(raw_payload),str(stage)],cwd=ROOT,check=True)
    if hashlib.sha256(target.read_bytes()).hexdigest()!=before:raise ValueError('HTML changed during build; staged output retained, rerun against latest')
    backup=DEST/('before-representatives-'+before[:12]+'.html')
    if not backup.exists():backup.write_bytes(target.read_bytes())
    stage.replace(target)
    report=dict(version=1,html=str(target),htmlBeforeSha256=before,htmlAfterSha256=hashlib.sha256(target.read_bytes()).hexdigest(),schemes=audit,unrelatedResearchSchemesPreserved=len(untouched.keys()-audit.keys()),filterRowPacking=packing,decodedPayloadBytes=payload_bytes)
    (ROOT/'research/notes/2026-11-17-toned-2126-r11-representatives.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print('Published',len(audit),'representatives:',target,flush=True)

if __name__=='__main__':main()
