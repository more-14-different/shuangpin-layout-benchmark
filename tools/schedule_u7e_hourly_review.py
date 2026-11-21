"""Wake the existing Codex conversation hourly; no replacement/model-only rule review."""
import argparse
import datetime
import json
import os
from pathlib import Path
import subprocess
import time
import uuid
import psutil

ROOT=Path(__file__).resolve().parents[1]


def atomic(p,value):
    temp=Path(str(p)+'.tmp')
    temp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    os.replace(temp,p)


def prompt_for(work,ack):
    return (f'【用户授权的每小时AI复盘】继续本会话的UED-3158固定声母、21×21无调韵母CPU退火。'
            f'研究工作树={ROOT}；工作目录={work}。先读取status.json、最新reviews/hour-*.json及上次ai-reviews报告；'
            '必要时只读查询search.sqlite前沿。亲自比较1/2/3/5倍CKT与3158、配对保持、M/D/V、两线精算时间和跨线迁移收益，'
            '判断是否继续全配对、仅拆一组探针或调整中心/温度。可以执行已有授权范围内的安全调整并验证；不得改声母、'
            '突破D2/V5/M41、21键域或用GPU，不得自动发布HTML。保持资源友好；避免重复全量复算。'
            '向用户简洁报告结果、判断与实际动作，明确固定辅序分数仍待独立复核。'
            f'完成后将本次结果和下一步写入{ack}（JSON，含reviewedAt、summary、actions）；它也是定时器的确认。'
            '若研究已停止，作最后一次汇报并结束小时唤醒；不另开任务、不再次创建定时器。')


def classify_receipt(returncode,stdout,stderr):
    queued='Queued message ' in stdout
    warning='warning' in (stdout+'\n'+stderr).lower()
    return dict(queued=queued,resumeRequested=queued and returncode==0,
                resumeWarning=warning,returncode=returncode)


def should_dispatch(now,next_due,last_ack,pending_since):
    return now>=next_due and (pending_since is None or last_ack)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work',type=Path,default=ROOT/'research/.cache/u7e-grouped-cpu-20261121')
    parser.add_argument('--thread',required=True)
    parser.add_argument('--pwsh',default='pwsh.exe')
    parser.add_argument('--interval',type=float,default=3600)
    args=parser.parse_args()
    assert args.interval>=60
    work=args.work.resolve()
    folder=work/'ai-reviews'
    folder.mkdir(exist_ok=True,parents=True)
    lock=(folder/'timer.lock').open('a+b')
    lock.seek(0)
    if lock.read(1)==b'':
        lock.write(b'0');lock.flush()
    lock.seek(0)
    if os.name=='nt':
        import msvcrt
        msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
        psutil.Process().nice(psutil.BELOW_NORMAL_PRIORITY_CLASS)
    state_path=folder/'timer-status.json'
    old=json.loads(state_path.read_text(encoding='utf8')) if state_path.exists() else {}
    assert not old or old['threadId']==args.thread
    state=dict(state='running',pid=os.getpid(),threadId=args.thread,startedUtc=old.get('startedUtc',time.time()),
               nextDueUtc=old.get('nextDueUtc',time.time()+args.interval),intervalSeconds=args.interval,
               dispatches=old.get('dispatches',0),pendingAck=old.get('pendingAck'),
               pendingSince=old.get('pendingSince'),lastReceipt=old.get('lastReceipt'),
               mechanism='codex queue --thread CURRENT_THREAD --message PROMPT --resume')
    atomic(state_path,state)
    last_write=0
    try:
        while True:
            if (folder/'STOP').exists():
                state['state']='stopped_by_request'
                break
            campaign=json.loads((work/'status.json').read_text(encoding='utf8'))
            terminal=campaign['state'].startswith('completed') or campaign['state'] in ['stopped','error']
            ack=bool(state['pendingAck'] and Path(state['pendingAck']).exists())
            if ack:
                state['lastAcknowledgedReview']=state['pendingAck']
                state['pendingAck']=state['pendingSince']=None
            now=time.time()
            due=should_dispatch(now,state['nextDueUtc'],ack,state['pendingSince'])
            if terminal and state['pendingSince'] is None:
                due=True
            if due and campaign['state']!='paused':
                ident=datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:6]
                ack_path=folder/(ident+'-review.json')
                message_path=folder/(ident+'-prompt.txt')
                message_path.write_text(prompt_for(work,ack_path),encoding='utf8',newline='\n')
                command=[args.pwsh,'-NoLogo','-NoProfile','-File',str(ROOT/'tools/wake_u7e_review.ps1'),
                         '-ThreadId',args.thread,'-MessagePath',str(message_path)]
                result=subprocess.run(command,cwd=ROOT,capture_output=True,text=True,encoding='utf8',
                                      timeout=120,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                receipt=dict(**classify_receipt(result.returncode,result.stdout,result.stderr),utc=now,
                         stdout=result.stdout[-3000:],stderr=result.stderr[-3000:],ack=str(ack_path))
                atomic(folder/(ident+'-receipt.json'),receipt)
                state['lastReceipt']=receipt
                if receipt['queued']:
                    state['dispatches']+=1
                    state['pendingAck']=str(ack_path)
                    state['pendingSince']=now
                    state['nextDueUtc']=now+args.interval
                    if terminal:
                        state['state']='final_review_queued'
                        break
                else:
                    state['state']='queue_failed'
                    state['nextDueUtc']=now+60
            if state['pendingSince'] and now-state['pendingSince']>args.interval:
                state['state']='waiting_for_actual_ai_ack_no_duplicate_wakes'
            elif state['state'] not in ['queue_failed']:
                state['state']='running'
            if now-last_write>30:
                state['updatedUtc']=now
                atomic(state_path,state)
                last_write=now
            time.sleep(2)
    except BaseException as error:
        state['state']='error'
        state['error']=repr(error)
        raise
    finally:
        state['updatedUtc']=time.time()
        atomic(state_path,state)
        lock.close()


if __name__=='__main__':
    main()
