"""Add audited candidate A with every existing R11 benchmark map populated."""
import copy,hashlib,importlib,json,os,subprocess,sys,tempfile
from pathlib import Path
import integrate_shenyun_21x26_production as production
import integrate_shenyun_21x26_balanced_flagship as flagship
import integrate_shenyun_21x28 as helper
ROOT=Path(__file__).resolve().parents[1]
HTML=ROOT/'a7_CKT_R11.html'
SNOW=Path('D:/C2D/Documents/rime-snow-pinyin')
REPLAY=ROOT/'research/.cache/R11_integrated_replay'
REVIEW=ROOT/'research/notes/2026-11-15-untoned-2126-production-candidates.json'
IDENT='RC26-39a5bfdc045342cd'
DEST=ROOT/'a7_CKT_R11_integrated_materials/untoned_candidate_a'
HEADS='b p m f d t n l g k h j q x zh ch sh r z c s A E O W Y YU'.split()
FINALS='a ai an ang ao e ei en eng er i ia ian iang iao ie in ing iong iu o ong ou u ua uai uan uang ui un uo v van ve vn'.split()
def read(p): return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def write(p,z): p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(z,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def run(*args,cwd=ROOT): subprocess.run([str(a) for a in args],cwd=cwd,check=True)
def main():
 import base64
 DEST.mkdir(parents=True,exist_ok=True)
 sys.path.insert(0,str(SNOW/'scripts/research'))
 fixed=production.load_module('candidate_a_fixed',SNOW/'scripts/research/integrate_shenyun_21x21_completion_fixed_frontier.py')
 sys.path.insert(0,str(REPLAY)); split=importlib.import_module('audit').split
 review=read(REVIEW); selected=next(r for r in review['results'] if r['id']==IDENT)
 assert selected['pass'] and selected['originalMemoryAudit']['M']==40
 raw=base64.b64decode(selected['key']); initial=dict(zip(HEADS,(chr(65+k) for k in raw[:27]))); final=dict(zip(FINALS,(chr(65+k) for k in raw[27:])))
 html=HTML.read_text(encoding='utf-8'); data,body,end=helper.extract_payload(html)
 old_ids={e['id'] for e in data['entries']}
 if IDENT in old_ids:
  published=next(e for e in data['entries'] if e['id']==IDENT)
  assert published['initialMap']==initial and published['finalMap']==final
  assert not any(IDENT in ids for ids in production.missing_by_map(data,old_ids).values())
  assert abs(published['productionCandidateMetrics']['replayedCktV51']-selected['score'])<1e-12
  assert published['r11Provenance']['reviewSha256']==hashlib.sha256(REVIEW.read_bytes()).hexdigest()
  assert len(published['bPathMetricsNative'])==8
  print(json.dumps(dict(id=IDENT,alreadyIntegrated=True,cktV51=selected['score'])))
  return
 before=helper.preservation_snapshot(data,old_ids); missing_before=production.missing_by_map(data,old_ids)
 source=read(REPLAY/'source.json'); assert source['pinyin']==data['pinyin']
 scheme=dict(id=IDENT,initialMap=initial,finalMap=final,toneKeys='IEUAO',capacity=[21,26],actual=[21,26],M=40,D=3,V=1,label='综合候选 A',atlasSubfamily='21x26 dual-empty balanced candidate A',atlasSource='research/untoned-production-v51-descent-20261114@ed4fc1e')
 helper.SCHEME_NAMES[IDENT]='冰雪神韵·21×26 综合候选 A'
 entry=helper.make_entry(source,split,scheme)
 entry.update(name='冰雪神韵·21×26 综合候选 A',family='Snow Shenyun 21x26',subfamily='无调·双空·M40/D3/V1·综合候选 A',notes=['研究候选；未替换 Rime 生产配置。','Common399 全覆盖且399码互异；QZ/ZQ双空；M40/D3/V1。','shapeKeysByMeaning=AEUIO；toneKeysByTone=IEUAO；toneDigitsByShapeMeaning=42310。','CKT v5.1 固定形辅序12/12/24、调辅序12/21/13；soft-page-fill-v2；未做候选专属辅序稳健性扫描。'])
 entry['r11Provenance']=dict(kind='audited untoned production candidate; not deployed',soundLayout=IDENT,review=str(REVIEW.relative_to(ROOT)),reviewSha256=hashlib.sha256(REVIEW.read_bytes()).hexdigest(),stateKey=selected['key'])
 exact=REPLAY/'exact'/f'{IDENT}.json'
 if not exact.exists():
  score_list=REPLAY/'entries_to_score.json'; original=score_list.read_bytes() if score_list.exists() else None
  try:
   write(score_list,[entry]);run('node','--max-old-space-size=1800','eval_full.js','0','1',cwd=REPLAY)
  finally:
   if original is None: score_list.unlink(missing_ok=True)
   else: score_list.write_bytes(original)
 scored=read(exact); assert scored['entry']['codeList']==entry['codeList']
 for actual,expected in [(scored['scores']['ensembleV4']['score'],selected['independent']['a7eV4']),(scored['scores']['ensembleV5']['score'],selected['independent']['a7eV5']),(scored['pairs']['S2']['e34'],selected['independent']['tracks']['S2']['e34'])]: assert abs(actual-expected)<1e-9
 previous_cwd=Path.cwd()
 try:
  helper.integrate(data,source,[entry],{IDENT:scored},REPLAY);helper.integrate_macroxue(data,[entry],REPLAY)
 finally: os.chdir(previous_cwd)
 assert before==helper.preservation_snapshot(data,old_ids), 'Existing benchmark changed'
 dictionary_paths=[SNOW/f'snow_pinyin.{name}.dict.yaml' for name in ('base','ext','tencent')]
 corpus=helper.read_word_corpus(dictionary_paths,max_cut=max(helper.CUTS),allowed_pinyin={helper.normalize_pinyin(source['pinyin'][i]) for i,_ in source['base']})
 collisions=helper.benchmark_catalogue([entry],source['pinyin'],corpus)
 entry['fourCodeCollision']=collisions[IDENT]
 data['fourCodeCollisionBenchmark']['catalogueCount']=len(data['entries'])
 data['fourCodeCollisionBenchmark']['schemeCount']=sum('fourCodeCollision' in e for e in data['entries'])
 with tempfile.TemporaryDirectory(prefix='r11-candidate-a-') as tmp:
  temp=Path(tmp); staged=temp/'staged.html'
  def stage(value=data): staged.write_text(html[:body]+fixed.pack(value)+html[end:],encoding='utf-8')
  stage()
  for mapping,block in [('native','completionB'),('fixed','completionBFixed'),('v2','completionBV2')]:
   output=DEST/f'{mapping}.json';cmd=['node',SNOW/'scripts/research/score_shenyun_completion_ckt.js','--html',staged,'--output',output,'--ids',IDENT,'--mapping','fixed' if mapping=='v2' else mapping]
   if mapping=='v2':cmd+=['--model','v2']
   run(*cmd,cwd=SNOW);item=read(output)['schemes'][IDENT];data[block]['schemes'][IDENT]=item
   if mapping!='v2':data[block]['ensembleScores'][IDENT]={kind:{str(t):fixed.ensemble(item['modes'],data[block]['schemes']['S005']['modes'],t,weight) for t in (0,150,300,600)} for kind,weight in [('equal',1),('word2',2)]}
  one=copy.copy(data);one['entries']=[entry];stage(one);output=DEST/'v3.json'
  run('node',ROOT/'tools/score_completion_ckt_v3.js','--html',staged,'--output',output,'--limit','1');data['completionBV3']['schemes'][IDENT]=read(output)['schemes'][IDENT]
  stage();output=DEST/'v4.json';run('node',ROOT/'tools/score_completion_ckt_v4.js','--html',staged,'--output',output,'--ids',IDENT,'--compact','--no-cross-audit','--quiet');data['completionBV4']['schemes'][IDENT]=read(output)['schemes'][IDENT]
  output=DEST/'terminal.json';run('node',ROOT/'tools/score_terminal_buckets.js','--html',staged,'--snow',SNOW,'--ids',IDENT,'--output',output);entry['terminalBucketAudit']=read(output)[IDENT]
  output=DEST/'v5-legacy-v51.json';run('node',ROOT/'tools/score_ckt_v5_v51_scheme.js','--id',IDENT,'--html',staged,'--snow',SNOW,'--output',output);legacy=read(output)
  output=DEST/'v51-fixed.json';run('node',ROOT/'tools/score_untoned_candidate_native.js','--id',IDENT,'--html',staged,'--snow',SNOW,'--fixture',ROOT/'research/.cache/ckt-v4-ergonomics.json','--review',REVIEW,'--output',output);native=read(output)
 entry['bPathMetricsNative']={key:data['completionB']['schemes'][IDENT]['modes'][mode][kind][stage_name] for key,mode,kind,stage_name in flagship.NATIVE_B_PATHS}
 data['bPathBenchmark']['schemeCount']=sum(len(e.get('bPathMetricsNative',{}))==8 for e in data['entries'])
 metrics=dict(memory=40,displacedInitials=3,displacedVowels=1,mxScore=selected['erg']['mx'],homeS2=selected['erg']['homeS2'],homeFloor=selected['erg']['homeFloor'],wMax=selected['erg']['wMax'],yMax=selected['erg']['yMax'],rpMax=selected['erg']['rpMax'])
 metrics.update(replayedCktV3=production.score_v3(data['completionBV3']['schemes'][IDENT]['modes'],data['completionBV3']['schemes']['S005']['modes']),replayedCktV4=production.score_v4(data['completionBV4']['schemes'][IDENT]['modes'],data['completionBV4']['schemes']['S005']['modes'],data['completionBV4']['cognitiveDefaults']),replayedCktV5=legacy['cktV5']['score'],replayedCktV51=native['score'],cktV4Aggregate=production.aggregate_v4(data['completionBV4']['schemes'][IDENT]['modes']),cktV5Aggregate=legacy['cktV5']['aggregate'],cktV51Aggregate=native['aggregate'],cktV5Policies=legacy['cktV5']['policies'],cktV51Policies=native['policies'],cktV51BalanceContract='soft-page-fill-v2')
 entry['productionCandidateMetrics']=metrics
 missing=production.missing_by_map(data,old_ids|{IDENT})
 assert all(IDENT not in v and v==missing_before[k] for k,v in missing.items()), 'Missing benchmark map'
 assert entry['memoryAuditR2']['M']==40 and entry['memoryAuditR2']['unique']==399
 assert before==helper.preservation_snapshot(data,old_ids), 'Existing catalogue changed'
 audit=dict(version='untoned-candidate-a-r11-1',id=IDENT,provenance=entry['r11Provenance'],entry=entry,productionCandidateMetrics=metrics,cktTracks=data['ckt']['tracks'][IDENT],fairCKT=data['fairCKT']['values'][IDENT],ensembles={k:data[k]['values'][IDENT] for k in ['ensemble','ensembleV2','ensembleV3','ensembleV4','ensembleV5','ensembleV6']},load=data['r11LoadSummaries'][IDENT],pair=data['r11PairMetrics']['values'][IDENT],macroxue=data['macroxue']['values'][IDENT],fourCodeCollision=collisions[IDENT],completion={k:data[k]['schemes'][IDENT] for k in ['completionB','completionBFixed','completionBV2','completionBV3','completionBV4']},fixedNativeV51=native,preservationPassed=True,benchmarkMaps=sorted(missing))
 write(ROOT/'research/notes/2026-11-15-untoned-2126-candidate-a-r11.json',audit)
 fixed.write_payload(HTML,html,body,end,data)
 print(json.dumps(dict(id=IDENT,cktV51=native['score'],catalogue=len(data['entries']),benchmarkMaps=len(missing),preservationPassed=True)))
if __name__=='__main__':main()
