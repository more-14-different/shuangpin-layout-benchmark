"""Archive the stopped CPU campaign's final results without copying its large database."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sqlite3
import zlib

ROOT=Path(__file__).resolve().parents[1]
PREFIX=ROOT/'research/notes/2026-11-21-u7e-grouped-cpu-final'
KINDS=['character','word2','word3','word4']
WEIGHTS=[1,3,1,1]
MULT=[1,2,3,5]
RATES=['firstAuxRate','secondAuxRate','thirdAuxRate','selectionRate','meanRejectedCandidates','meanPageActions']
COSTS=[300,300,300,600,50,300]


def read(p):
    return json.loads(Path(p).read_text(encoding='utf8'))


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def reprice(modes,reference,m):
    def effective(t):
        return t['motorUpperMs']+m*sum(t.get(field,0)*cost for field,cost in zip(RATES,COSTS))
    return 10*(sum(w*(effective(modes[mode][kind])/effective(reference[mode][kind]))**4
                   for mode in ['keytao','sanpin'] for kind,w in zip(KINDS,WEIGHTS))/12)**.25


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work',type=Path,default=ROOT/'research/.cache/u7e-grouped-cpu-20261121')
    args=parser.parse_args()
    work=args.work.resolve()
    cfg_path=ROOT/'research/config/u7e-grouped-cpu.json'
    cfg=read(cfg_path)
    status,timer=read(work/'status.json'),read(work/'ai-reviews/timer-status.json')
    assert status['state']=='stopped' and timer['state']=='stopped_by_request'
    assert (work/'STOP').exists() and (work/'ai-reviews/STOP').exists()
    db_path=work/'search.sqlite'
    db=sqlite3.connect(f'file:{db_path.as_posix()}?mode=ro',uri=True)
    db.execute('BEGIN')
    state=read_state=json.loads(db.execute("SELECT v FROM meta WHERE k='state'").fetchone()[0])
    count=db.execute('SELECT COUNT(*) FROM states').fetchone()[0]
    assert count==state['samples']+1==sum(state['evaluations'].values())+1
    assert all(cap==0 for cap in state['maxBroken'].values()), 'this report describes the protected full-pair run'
    pairs=[(cfg['finalNames'].index(a),cfg['finalNames'].index(b)) for a,b in cfg['preferredPairs']]
    memory_counts={}
    empty_count=paired_count=0
    maximum_difference=0.
    seed_key=''.join(chr(k+65) for k in cfg['seedFinalKeys'])
    checked=0
    for key,stored_memory_mask,stored_empty,blob in db.execute('SELECT k,pairmask,empty,data FROM states'):
        row=json.loads(zlib.decompress(blob))
        finals=row['finals']
        assert key==row['key']==''.join(chr(k+65) for k in finals)
        assert len(finals)==35 and set(finals)==set(cfg['allowedKeys'])
        memory=6+sum(chr(k+65)!=f.upper() for k,f in zip(finals,cfg['finalNames']))
        assert memory==row['M']<=41
        broken=[i for i,(a,b) in enumerate(pairs) if finals[a]!=finals[b]]
        assert broken==row['broken'] and sum(1<<i for i in broken)==stored_memory_mask
        empty=not any((cfg['initialKeys'][h],finals[f]) in [(16,25),(25,16)] for h,f in cfg['commonPairs'])
        assert empty==row['emptyBuckets']==bool(stored_empty)
        if key!=seed_key:
            assert broken==[]
            paired_count+=1
            empty_count+=empty
            memory_counts[str(memory)]=memory_counts.get(str(memory),0)+1
        for i,m in enumerate(MULT):
            difference=abs(reprice(row['modes'],cfg['referenceModes'],m)-row['scores'][i])
            maximum_difference=max(maximum_difference,difference)
            assert difference<1e-9,(row['id'],m,difference)
        checked+=1
    finalists={}
    frontiers={}
    for lane in ['strict','open']:
        frontiers[lane]={}
        for i,m in enumerate(MULT):
            column=['score1','score2','score3','score5'][i]
            where='broken=0'+(' AND empty=1' if lane=='strict' else '')
            rows=db.execute(f'SELECT data FROM states WHERE {where} ORDER BY {column},k LIMIT 5').fetchall()
            ids=[]
            for (blob,) in rows:
                row=json.loads(zlib.decompress(blob))
                row['initialMap']=cfg['initialMap']
                row['finalMap']=dict(zip(cfg['finalNames'],[chr(k+65) for k in row['finals']]))
                row['finalGroups']={k:[f for f,letter in row['finalMap'].items() if letter==k]
                                    for k in sorted(set(row['finalMap'].values()))}
                row['deltaFrom3158']=[a-b for a,b in zip(row['scores'],cfg['expectedSeedScores'])]
                finalists[row['id']]=row
                ids.append(row['id'])
            frontiers[lane][str(m)]=ids
    db.close()
    reviews=[read(p) for p in sorted((work/'reviews').glob('hour-*.json'))]
    assert len(reviews)==state['reviewCount']
    local_reviews=[read(p) for p in sorted((work/'ai-reviews').glob('*review*.json'))
                   if p.name!='timer-status.json' and not p.name.endswith('-receipt.json')]
    history_path=Path(str(PREFIX)+'-hourly-reviews.json')
    history=dict(completed=True,programRuleReviews=reviews,actualAssistantReports=local_reviews,
                 note='Program rule reviews are not assistant/model reviews. The later real-AI timer was stopped before its first hourly due time.')
    history_path.write_text(json.dumps(history,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    total=sum(state['exactSeconds'].values())
    result=dict(completed=True,state='stopped_by_user',seed=cfg['seedId'],
        contract=dict(fixedInitialMap=cfg['initialMap'],capacity=[21,21],maxD=2,maxV=5,maxM=41,
                      preferredPairs=cfg['preferredPairs'],allSevenPairsRetained=True,
                      eiErAtE='preferred, not mandatory',hardRightPinkyCap=False,backend='CPU-only',
                      policy=cfg['policies'],costMultipliers=MULT,
                      scoresAre='Fixed seed robust policies, not each candidate own-policy optimum'),
        runtime=dict(startedUtc=state['startedUtc'],stoppedUtc=status['updatedUtc'],
                     elapsedHours=(status['updatedUtc']-state['startedUtc'])/3600,
                     exactSeconds=state['exactSeconds'],strictExactFraction=state['exactSeconds']['strict']/total,
                     exactEvaluations=state['evaluations'],newLayouts=state['samples'],
                     totalCachedIncludingControl=count,memoryCountsExcludingControl=memory_counts,
                     fullPairNewLayouts=paired_count,doubleEmptyLayoutsExcludingControl=empty_count,
                     programRuleReviewCount=len(reviews),actualAssistantReportCount=len(local_reviews),
                     cpuProcessesAndAiTimerStopped=True),
        baselineScores=cfg['expectedSeedScores'],frontiers=frontiers,finalists=finalists,
        conclusion='No explored full-seven-pair layout beats UED-3158 at 1/2/3/5x costs. '
                   'Open-bucket search improves 1x/5x relative to strict; strict leader also supplies open 2x/3x. '
                   'No pair was split before user stopped the campaign. Finite heuristic, no optimality proof.',
        validation=dict(allCachedScoresIndependentlyRepriced=checked,maximumCktDifference=maximum_difference,
                        allMemoryAndKeyDomainsChecked=True,allPairMasksAndBucketFlagsChecked=True),
        database=dict(archived=False,localPath=str(db_path),bytes=db_path.stat().st_size,
                      note='Explicitly excluded from Git; no database copy/compression performed.'),
        sourceHashes={str(p):sha(p) for p in [Path(__file__),cfg_path,
                     ROOT/'research/notes/2026-11-21-u7e-grouped-cpu-stop.json',history_path]})
    Path(str(PREFIX)+'.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    lines=['# U7E声母＋优先七组韵母：停止时最终结果','',
           f'运行约 {result["runtime"]["elapsedHours"]:.3f} 小时；新精算布局 {state["samples"]:,} 个，含基线控制共 {count:,} 条。'
           f'双空桶/开放线精算时间为 {state["exactSeconds"]["strict"]:.3f}/{state["exactSeconds"]["open"]:.3f} 秒，'
           f'严格线占 {100*result["runtime"]["strictExactFraction"]:.5f}%。','',
           '固定UED-3158声母；21×21，D≤2/V≤5/M≤41。CPU低优先级、单逻辑核、65%占空比。七组配对直到停止均未拆散；ei/er优先E。未额外限制右小指。','',
           '## 各倍率最低值','',
           '以下每列可以来自不同布局；固定基线稳健辅序，候选尚未逐套重选辅序。','',
           '| 范围 | 1倍 | 2倍 | 3倍 | 5倍 |','|---|---:|---:|---:|---:|',
           '| 原UED-3158 | '+' | '.join(f'{v:.9f}' for v in cfg['expectedSeedScores'])+' |']
    for lane,label in [('strict','QZ/ZQ双空桶'),('open','不约束空桶')]:
        values=[finalists[frontiers[lane][str(m)][0]]['scores'][i] for i,m in enumerate(MULT)]
        lines.append('| '+label+' | '+' | '.join(f'{v:.9f}' for v in values)+' |')
    lines+=['','结论：本轮没有超过原3158。优先配对并非全局不可行的证明；当前收益不足以替换已发布方案。'
            '用户已要求停止，未继续实施拆一组探针。','','## 前沿方案','',
            '| 范围/目标 | ID | M | ei/er在E | 右小指混合 | 八轨峰值 |',
            '|---|---|---:|:---:|---:|---:|']
    for lane in ['strict','open']:
        for m in MULT:
            r=finalists[frontiers[lane][str(m)][0]]
            lines.append(f'| {lane}/{m}倍 | {r["id"]} | {r["M"]} | {"是" if r["eiErAtE"] else "否"} | '
                         f'{100*r["rightPinkyMixed"]:.6f}% | {100*r["rightPinkyPeak8"]:.6f}% |')
    lines+=['','候选的完整声韵映射、八轨数据及各倍率前5名索引均在同名JSON；数据库只保留在本机缓存。','',
            '## 小时检查与AI复盘','',
            f'程序规则检查 {len(reviews)} 次；实际助手报告 {len(local_reviews)} 份。二者分开归档。'
            '后补的真正会话唤醒计时器在首次整小时触发前随用户停止指令退出，不能将程序检查记为AI复盘。','',
            '严格线前沿可直接复用至开放线；开放线有Q/Z冲突时生成保持配对的修复提案。两线仍严格均分精算耗时。','',
            '## 最终发布与可复现边界','',
            'UED-3158和UPD-f254的最终百万场景稳健辅序、完整回放及HTML验证见 `2026-11-21-u7e-pinky-aux-final.md`。'
            '两者均为键道12/231/23、三拼12/213/23。HTML自身是忽略的构建产物，已保存两次发布补丁包和报告。','',
            f'本报告对全部 {checked:,} 条缓存重新定价、检查记忆/键域、配对与空桶标记；最大CKT差异 {maximum_difference:.3g}。'
            '运行和评分代码、固定模板归档、报告、小型前沿结果入Git；SQLite、WAL/SHM、构建目录和大缓存不入Git。','',
            '部分原始语料/误键标定仍是本机缓存；历史来源位于 research/untoned-cr7e-v52-20261119@e5256af。'
            '本次仅把这轮相关文件移入当前会话分支，没有合并其他研究线，也未纳入较早的未跟踪文件。','']
    Path(str(PREFIX)+'.md').write_text('\n'.join(lines),encoding='utf8',newline='\n')
    print(json.dumps(dict(completed=True,newLayouts=state['samples'],cachedStates=count,
                         finalistLayouts=len(finalists),elapsedHours=result['runtime']['elapsedHours'],
                         maxDifference=maximum_difference,databaseArchived=False),ensure_ascii=False))


if __name__=='__main__':
    main()
