"""Archive complete auxiliary-policy tables and validate the published comparison."""
import gzip,hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];DIR=ROOT/'research/.cache/untoned-2126-aux-robust-20261115';NOTES=ROOT/'research/notes';PREFIX='2026-11-15-untoned-2126-aux-robust'
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def main():
 comparison=read(NOTES/(PREFIX+'-comparison.json'));fresh=read(NOTES/(PREFIX+'-fresh.json'));assert fresh['passed'] and len(fresh['checks'])==14 and max(r['maximumAbsoluteDifference'] for r in fresh['checks'])<=1e-9
 exports={}
 for label,id in comparison['contract']['ids'].items():
  source=DIR/f'{label}.components.json';z=read(source);assert z['id']==id
  for mode in ['keytao','sanpin']:assert len(z['cases'][mode]['results'])==144 and len({r['policyKey'] for r in z['cases'][mode]['results']})==144
  saved=NOTES/f'{PREFIX}-{label}-components.json.gz';raw=source.read_bytes();saved.write_bytes(gzip.compress(raw,compresslevel=9,mtime=0));assert gzip.decompress(saved.read_bytes())==raw
  exports[saved.name]=dict(sha256=sha(saved),uncompressedSha256=sha(source),policiesPerMode=144)
  assert comparison['results'][label]['binding']['componentsSha256']==sha(source)
  assert comparison['results'][label]['cases']['keytao']['gridPoints']==comparison['results'][label]['cases']['sanpin']['gridPoints']==1771561
  assert all(comparison['results'][label]['cases'][mode]['positiveGridPoints']==1000000 for mode in ['keytao','sanpin'])
  cached=read(DIR/f'{label}.analysis.json');assert comparison['results'][label]==cached
  for field in ['componentsSha256','analyzerSha256','helperSha256']:assert len(cached['binding'][field])==64
  assert cached['binding']['analyzerSha256']==sha(ROOT/'tools/analyze_untoned_aux_comparison.py')
  assert cached['binding']['helperSha256']==sha(ROOT/'tools/analyze_single_ckt_v51_aux_order.py')
 historical=Path(r'D:\C2D\Desktop\Code\Lua\inputMethod\shuangpin-layout-benchmark\a7_CKT_R11_integrated_materials\d3v1_ckt51_soft_balance_components_v2.json');assert sha(historical)=='abe726c8708cc37a5221a822235f60ce44c38ee9ea576615934a1b825b9d0a59';before=read(historical);after=read(DIR/'P.components.json')
 for mode in ['keytao','sanpin']:
  assert before['cases'][mode]['results']==after['cases'][mode]['results']
  assert before['references'][mode]==after['references'][mode]
 assert abs(comparison['results']['P']['robustPairScore']-9.10299979136027)<1e-12
 for file,digest in comparison['contract']['sourceHashes'].items():assert sha(file)==digest,file
 report=dict(passed=True,layouts=7,policiesPerMode=144,nativePolicies=2016,gridPointsPerMember=1771561,positiveSubsetPointsPerMember=1000000,freshNativeComparisons=14,maximumFreshDifference=max(r['maximumAbsoluteDifference'] for r in fresh['checks']),historicalProductionPolicyTracksExactlyEqual=288,comparisonSha256=sha(NOTES/(PREFIX+'-comparison.json')),freshSha256=sha(NOTES/(PREFIX+'-fresh.json')),exports=exports,scripts={file:sha(ROOT/file) for file in ['tools/prepare_untoned_aux_comparison.js','tools/search_untoned_aux_checkpoint.js','tools/analyze_untoned_aux_comparison.py','tools/verify_untoned_aux_policies.js', 'tools/export_untoned_aux_comparison.py']})
 report['pairwiseSha256']=sha(NOTES/(PREFIX+'-pairwise.json'))
 for script in ['tools/compare_untoned_aux_pairwise.py','tools/report_untoned_aux_comparison.py']:
  report['scripts'][script]=sha(ROOT/script)
 (NOTES/(PREFIX+'-verification.json')).write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
if __name__=='__main__':main()
