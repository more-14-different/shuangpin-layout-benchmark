"""Smoke-test the offline completion table with headless Chrome/CDP."""
from __future__ import annotations

import json
import subprocess
import tempfile
import time
from pathlib import Path

import requests
import websocket
import psutil


HTML = Path(__file__).resolve().parents[1] / 'a7_CKT_R11.html'
CHROME = Path(r'C:\Program Files\Google\Chrome\Application\chrome.exe')


def main() -> None:
    with tempfile.TemporaryDirectory(prefix='r11-b-completion-') as profile:
        proc = subprocess.Popen([
            str(CHROME), '--headless=new', '--disable-gpu', '--no-first-run',
            '--no-default-browser-check', '--disable-extensions',
            '--disable-background-networking', '--remote-allow-origins=*',
            '--remote-debugging-port=0', f'--user-data-dir={profile}', 'about:blank',
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            port_file = Path(profile) / 'DevToolsActivePort'
            deadline = time.monotonic() + 30
            while not port_file.exists() and time.monotonic() < deadline:
                time.sleep(.1)
            if not port_file.exists():
                raise RuntimeError('Chrome DevTools port unavailable')
            port = int(port_file.read_text().splitlines()[0])
            page = next(x for x in requests.get(f'http://127.0.0.1:{port}/json/list', timeout=5).json() if x['type'] == 'page')
            ws = websocket.create_connection(page['webSocketDebuggerUrl'], timeout=30, origin='http://localhost')
            seq = 0

            def call(method: str, params: dict | None = None) -> dict:
                nonlocal seq
                seq += 1
                ws.send(json.dumps({'id': seq, 'method': method, 'params': params or {}}))
                while True:
                    msg = json.loads(ws.recv())
                    if msg.get('id') == seq:
                        if 'error' in msg:
                            raise RuntimeError(msg['error'])
                        return msg.get('result', {})

            def evaluate(expression: str):
                out = call('Runtime.evaluate', {'expression': expression, 'returnByValue': True, 'awaitPromise': True})
                if out.get('exceptionDetails'):
                    raise RuntimeError(out['exceptionDetails'])
                return out['result'].get('value')

            call('Page.navigate', {'url': HTML.as_uri()})
            deadline = time.monotonic() + 50
            while time.monotonic() < deadline:
                if evaluate("document.readyState==='complete' && typeof D !== 'undefined' && !!D?.completionB && !!document.querySelector('#family')"):
                    break
                time.sleep(.25)
            else:
                raise RuntimeError('R11 page did not finish loading')
            got = evaluate("""(()=>{
                const aux=document.querySelector('#uxAux');aux.value='AVUIO';
                const avuio=chosen().map(e=>e.id);
                const newIds=['BCW-728ebe1b8ae6','BCW-eb540e052854','BCW-d3f836f32da1','BCW-3245b61eed72','BCW-062294ac76a9'];
                const newEntries=newIds.map(id=>D.entries.find(e=>e.id===id));
                const keyboardSvg=keyboardSVG(newEntries[0]);
                const svg=new DOMParser().parseFromString(keyboardSvg,'image/svg+xml').documentElement;
                const anchorHatches=['F','J'].every(k=>svg.querySelector(`[data-key="${k}"] > rect[fill="url(#nf4-anchor)"]`));
                const nonAnchorHatch=!!svg.querySelector('[data-key="G"] > rect[fill="url(#nf4-anchor)"]');
                const heatSvg=new DOMParser().parseFromString(keyboardSVG(newEntries[0],Array(D.reference.keys.length+1).fill(0)),'image/svg+xml').documentElement;
                const heatAnchorHatches=['F','J'].every(k=>heatSvg.querySelector(`[data-key="${k}"] > rect[fill="url(#nf4-anchor)"]`));
                aux.value='AEUIO';const aeuio=chosen().map(e=>e.id);
                aux.value='all';
                uxRenderFair();
                const table=document.querySelector('table[data-ux-table="fair"]');
                const input=document.querySelector('#uxTau');
                const first=document.querySelector('.b-tau-inline');
                const headers=[...table.tHead.rows[0].cells];
                const equalIndex=headers.findIndex(c=>c.textContent.includes('A7E-v7'));
                const word2Index=headers.findIndex(c=>c.textContent.includes('字:词=1:2'));
                const fixedIndex=headers.findIndex(c=>c.textContent.includes('固定 IVUAO'));
                const cellValue=(t,index,id='R9-21X21-M40-02')=>Number(t.querySelector(`tr[data-dv-scheme="${id}"]`).cells[index].dataset.uxValue);
                const before=cellValue(table,equalIndex),word2Before=cellValue(table,word2Index),
                  defaultInput=input.value,inline=getComputedStyle(first).display,
                  inputOnRight=input.getBoundingClientRect().left>first.querySelector('button').getBoundingClientRect().right;
                input.value='600';input.dispatchEvent(new Event('change',{bubbles:true}));
                const updated=document.querySelector('table[data-ux-table="fair"]');
                const after=cellValue(updated,equalIndex),word2After=cellValue(updated,word2Index);
                const crossId='SNOW-SHENYUN-21X28-TONE';
                const crossFixed=cellValue(updated,fixedIndex,crossId),crossNative=cellValue(updated,word2Index,crossId);
                const expectedFixed=bCompletionScore(D.completionBFixed.schemes[crossId].modes,600,2,D.completionBFixed.schemes.S005.modes);
                UX.method='dictionary';uxRenderMethods();
                const dictionary=!!document.querySelector('.ux-definition-grid [data-help="bV7"]');
                uxOpenHelp('bV7',false);
                const help=document.querySelector('#uxHelp .ux-dialog-body')?.textContent||'';
                uxOpenHelp('bComposite0',false);
                const compositeHelp=document.querySelector('#uxHelp .ux-dialog-body')?.textContent||'';
                uxCloseHelp(false);UX.method='cktReport';uxRenderMethods();
                const methodVersion=document.querySelector('#view')?.textContent.includes('B-completion-CKT-word2-native-v2');
                const nativeR9=D.completionB.schemes['R9-21X21-M40-02'].modes.keytao;
                const mixedR9=bCompletionMixed(D.completionB.schemes['R9-21X21-M40-02'].modes,'keytao',600);
                const expectedMixed=(bCompletionTime(nativeR9.character,600)+2*bCompletionTime(nativeR9.word,600))/5;
                return {schemes:Object.keys(D.completionB.schemes).length,rows:table?.tBodies[0]?.rows.length,
                  avuioExperiment:avuio.includes('EXPERIMENT-21X21-110d170fca'),
                  avuioBpw:avuio.includes('BPW-c1924db8d054'),
                  newAvuio:newIds.every(id=>avuio.includes(id)),
                  newEntries:newEntries.every(Boolean),newCompletion:newIds.every(id=>!!D.completionB.schemes[id]&&!!D.completionB.ensembleScores[id]),
                  nativePolicy:D.completionB?.policy?.mappingMode==='native',fixedArchived:!!D.completionBFixed,
                  nativeBAll:D.entries.every(e=>Object.keys(e.bPathMetricsNative||{}).length===8),fixedHeader:fixedIndex>=0,
                  fixedControlValue:Math.abs(crossFixed-expectedFixed)<1e-12&&Math.abs(crossFixed-crossNative)>1e-6,
                  anchorHatches,heatAnchorHatches,nonAnchorHatch,
                  aeuio21x28:aeuio.includes('SNOW-SHENYUN-21X28-TONE'),
                  columns:table?.tHead?.rows[0]?.cells.length,defaultInput,
                  tau:UX.tau,label:first?.textContent,scoreS005:bCompletionScore(bCompletionRow({id:'S005'}),600),
                  word2S005:cellValue(updated,word2Index,'S005'),before,after,word2Before,word2After,
                  frozenWord2:D.completionB.ensembleScores?.['R9-21X21-M40-02']?.word2?.['600'],
                  frozenCount:Object.keys(D.completionB.ensembleScores||{}).length,
                  inline,inputOnRight,dictionary,word2Mixed:Math.abs(mixedR9-expectedMixed)<1e-12,helpFormula:help.includes('T_m,g(s,τ)'),
                  compositeHelp:compositeHelp.includes('单字组')&&compositeHelp.includes('二字词组'),methodVersion,
                  wordCard:!!UG.bUpper_sw,scoreCard:!!UG.bV7,
                  header:equalIndex>=0&&word2Index>=0};
            })()""")
            print(json.dumps(got, ensure_ascii=False))
            assert got['schemes'] == 567 and got['rows'] == 567
            assert got['newEntries'] and got['newCompletion'] and got['newAvuio']
            assert got['nativePolicy'] and got['fixedArchived'] and got['nativeBAll'] and got['fixedHeader'] and got['fixedControlValue']
            assert got['anchorHatches'] and got['heatAnchorHatches'] and not got['nonAnchorHatch']
            assert got['avuioExperiment'] and got['avuioBpw'] and got['aeuio21x28']
            assert got['columns'] >= 25 and got['tau'] == '600'
            assert got['defaultInput'] == '150'
            assert got['scoreS005'] == 10 and got['before'] != got['after']
            assert got['word2S005'] == 10 and got['word2Before'] != got['word2After']
            assert got['frozenCount'] == 567 and abs(got['frozenWord2'] - got['word2After']) < 1e-12
            assert got['inline'] in ('flex', 'inline-flex') and got['inputOnRight']
            assert got['wordCard'] and got['scoreCard'] and got['header']
            assert got['dictionary'] and got['word2Mixed'] and got['helpFormula'] and got['compositeHelp'] and got['methodVersion']
            assert '一次选重时间 τ' in got['label']
            ws.close()
        finally:
            parent = psutil.Process(proc.pid)
            children = parent.children(recursive=True)
            for child in children:
                child.terminate()
            parent.terminate()
            _, alive = psutil.wait_procs(children + [parent], timeout=10)
            for child in alive:
                child.kill()
            psutil.wait_procs(alive, timeout=10)


if __name__ == '__main__':
    main()
