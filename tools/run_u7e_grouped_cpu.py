"""Low-impact CPU annealing, exact-time balanced lanes, durable hourly rule reviews."""
import argparse
import gzip
import hashlib
import json
import math
import os
from pathlib import Path
import queue
import sqlite3
import subprocess
import threading
import time
import zlib
import psutil

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT/'research/config/u7e-grouped-cpu.json'
KINDS = ['character', 'word2', 'word3', 'word4']
WEIGHTS = [1, 3, 1, 1]
MULTIPLIERS = [1, 2, 3, 5]
LANES = ['strict', 'open']


def dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def atomic(p, value):
    p = Path(p)
    temp = Path(str(p)+'.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf8', newline='\n')
    os.replace(temp, p)


class Rng:
    def __init__(self, state):
        self.state = state or 1

    def random(self):
        x = self.state
        x ^= (x << 13) & 0xffffffff
        x ^= x >> 17
        x ^= (x << 5) & 0xffffffff
        self.state = x & 0xffffffff
        return self.state/4294967296

    def pick(self, items):
        return items[min(len(items)-1, int(self.random()*len(items)))]

    def shuffled(self, items):
        result = list(items)
        for i in range(len(result)-1, 0, -1):
            j = int(self.random()*(i+1))
            result[i], result[j] = result[j], result[i]
        return result


def pair_indices(cfg):
    return [(cfg['finalNames'].index(a), cfg['finalNames'].index(b)) for a, b in cfg['preferredPairs']]


def broken_pairs(finals, cfg):
    return [i for i, (a, b) in enumerate(pair_indices(cfg)) if finals[a] != finals[b]]


def memory(finals, cfg):
    return cfg['initialMemory']+sum(chr(k+65) != f.upper() for f, k in zip(cfg['finalNames'], finals))


def empty_buckets(finals, cfg):
    return not any((cfg['initialKeys'][h], finals[f]) in [(16, 25), (25, 16)]
                   for h, f in cfg['commonPairs'])


def legal(finals, cfg, lane, max_broken):
    return (len(finals) == 35 and set(finals) == set(cfg['allowedKeys']) and
            memory(finals, cfg) <= cfg['maxMemory'] and
            len(broken_pairs(finals, cfg)) <= max_broken and
            (lane == 'open' or empty_buckets(finals, cfg)))


def units_for(finals, cfg):
    groups = [(a, b) for a, b in pair_indices(cfg) if finals[a] == finals[b]]
    assigned = {f for g in groups for f in g}
    return groups+[(f,) for f in range(35) if f not in assigned]


def construct_grouped(cfg, lane, rng, preferred=None, anchor_e=False):
    """Surjective constrained unit assignment via bipartite matching, no hidden routing."""
    pairs = pair_indices(cfg)
    used = {f for pair in pairs for f in pair}
    units = pairs+[(f,) for f in range(35) if f not in used]
    preferred = preferred or cfg['seedFinalKeys']
    forbidden = [set() for _ in range(35)]
    if lane == 'strict':
        for h, f in cfg['commonPairs']:
            if cfg['initialKeys'][h] == 16:
                forbidden[f].add(25)
            if cfg['initialKeys'][h] == 25:
                forbidden[f].add(16)
    allowed = [{k for k in cfg['allowedKeys'] if not any(k in forbidden[f] for f in u)} for u in units]
    e_unit = next(i for i, u in enumerate(units) if set(u) == set(pairs[-1]))
    if anchor_e:
        allowed[e_unit] = {4}
    owner = {}

    def match(key, visited):
        candidates = rng.shuffled([i for i, a in enumerate(allowed) if key in a])
        candidates.sort(key=lambda i: (len(allowed[i]) != 1,
                                       -sum(preferred[f] == key for f in units[i])))
        for i in candidates:
            if i in visited:
                continue
            visited.add(i)
            if i not in owner or match(owner[i], visited):
                owner[i] = key
                return True
        return False

    keys = rng.shuffled(cfg['allowedKeys'])
    if anchor_e:
        keys.remove(4)
        keys.insert(0, 4)
    for key in keys:
        if not match(key, set()):
            raise RuntimeError('unit-to-key matching failed')
    finals = [None]*35
    for i, unit in enumerate(units):
        if i in owner:
            key = owner[i]
        else:
            preferred_keys = [preferred[f] for f in unit if preferred[f] in allowed[i]]
            key = rng.pick(preferred_keys) if preferred_keys and rng.random() < .8 else rng.pick(sorted(allowed[i]))
        for f in unit:
            finals[f] = key
    assert legal(finals, cfg, lane, 0)
    return finals


def mutate_once(base, cfg, rng, max_broken, pair_order=None):
    finals = list(base)
    units = units_for(base, cfg)
    split = len(broken_pairs(base, cfg)) < max_broken and rng.random() < .13
    if split:
        intact = [i for i, (a, b) in enumerate(pair_indices(cfg)) if finals[a] == finals[b]]
        if pair_order:
            favored = [i for i in pair_order if i in intact]
            intact = favored[:3] if favored and rng.random() < .75 else intact
        if intact:
            pair = pair_indices(cfg)[rng.pick(intact)]
            finals[rng.pick(pair)] = rng.pick(cfg['allowedKeys'])
            return finals
    first, second = rng.pick(units), rng.pick(units)
    ka, kb = finals[first[0]], finals[second[0]]
    op = rng.random()
    if op < .30:
        for f in first:
            finals[f] = rng.pick(cfg['allowedKeys']) if len(first) == 1 else ka
        if len(first) > 1:
            key = rng.pick(cfg['allowedKeys'])
            for f in first:
                finals[f] = key
    elif op < .66:
        for f in first:
            finals[f] = kb
        for f in second:
            finals[f] = ka
    elif op < .84:
        finals = [kb if k == ka else ka if k == kb else k for k in finals]
    elif op < .94:
        third = rng.pick(units)
        if not (set(first) & set(second) or set(first) & set(third) or set(second) & set(third)):
            kc = finals[third[0]]
            for unit, key in [(first, kb), (second, kc), (third, ka)]:
                for f in unit:
                    finals[f] = key
    else:
        a, b = pair_indices(cfg)[-1]
        finals[a] = finals[b] = 4  # ei/er preferred at E, not a hard constraint.
    return finals


def scores(modes, cfg):
    def effective(t, mult):
        return t['motorUpperMs']+mult*(t['effectiveMs']-t['motorUpperMs'])
    return [10*(sum(w*(effective(modes[mode][k], mult)/effective(cfg['referenceModes'][mode][k], mult))**4
                    for mode in ['keytao', 'sanpin'] for k, w in zip(KINDS, WEIGHTS))/12)**.25
            for mult in MULTIPLIERS]


def pinky(finals, modes, cfg):
    mapped = cfg['initialKeys']+list(finals)
    numerator = denominator = peak = 0
    for mi, mode in enumerate(['keytao', 'sanpin']):
        for ki, (kind, weight) in enumerate(zip(KINDS, WEIGHTS)):
            n = sum(v for k, v in zip(mapped, cfg['tokenMass'][mi][ki]) if k == 15)
            d = modes[mode][kind]['meanKeys']
            numerator += weight*n
            denominator += weight*d
            peak = max(peak, n/d)
    return numerator/denominator, peak


def choose_lane(seconds):
    return min(LANES, key=lambda lane: seconds[lane])


class Scorer:
    def __init__(self, cfg, work):
        templates = work/'templates.json'
        if not templates.exists():
            templates.write_bytes(gzip.decompress((ROOT/cfg['templatesArchive']).read_bytes()))
        assert sha(templates) == cfg['templatesSha256']
        binary = ROOT/cfg['binary']
        assert binary.name == 'score-untoned-v52-stream.exe', 'CPU-only executable required'
        self.error_file = (work/'native-stderr.log').open('a', encoding='utf8')
        self.process = subprocess.Popen([str(binary), str(templates), str(ROOT/cfg['snapshot']), str(ROOT/cfg['profile'])],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.error_file,
            text=True, encoding='utf8', bufsize=1,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)|getattr(subprocess, 'BELOW_NORMAL_PRIORITY_CLASS', 0))
        proc = psutil.Process(self.process.pid)
        self.affinity = [psutil.Process().cpu_affinity()[-1]]
        proc.cpu_affinity(self.affinity)
        if os.name == 'nt':
            proc.nice(psutil.BELOW_NORMAL_PRIORITY_CLASS)
        self.lines = queue.Queue()

        def pump():
            for line in self.process.stdout:
                self.lines.put(line)
            self.lines.put(None)

        threading.Thread(target=pump, daemon=True).start()
        self.ready = self.line()
        assert self.ready['ready']

    def line(self):
        line = self.lines.get(timeout=180)
        if line is None:
            raise RuntimeError('native scorer exited')
        return json.loads(line)

    def score(self, finals, cfg):
        key = ''.join(chr(k+65) for k in finals)
        ident = 'UGC-'+hashlib.sha256(bytes(cfg['initialKeys']+list(finals))).hexdigest()[:12]
        self.process.stdin.write(dump(dict(id=ident, state=cfg['initialKeys']+list(finals)))+'\n')
        self.process.stdin.flush()
        start = time.perf_counter()
        result = self.line()
        seconds = time.perf_counter()-start
        assert result['id'] == ident
        values = scores(result['modes'], cfg)
        assert abs(values[0]-result['score']) < 1e-9
        assert abs(values[1]-result['doubledScore']) < 1e-9
        mixed, peak = pinky(finals, result['modes'], cfg)
        return dict(id=ident, key=key, finals=list(finals), scores=values,
                    broken=broken_pairs(finals, cfg), M=memory(finals, cfg),
                    emptyBuckets=empty_buckets(finals, cfg),
                    eiErAtE=finals[cfg['finalNames'].index('ei')] == finals[cfg['finalNames'].index('er')] == 4,
                    rightPinkyMixed=mixed, rightPinkyPeak8=peak, modes=result['modes']), seconds

    def close(self):
        try:
            self.process.stdin.close()
            self.process.wait(timeout=20)
        except Exception:
            self.process.kill()
            self.process.wait(timeout=10)
        self.error_file.close()


class Campaign:
    def __init__(self, work, cfg, pinky_cap=False):
        self.work, self.cfg, self.pinky_cap = work, cfg, pinky_cap
        self.db = sqlite3.connect(work/'search.sqlite')
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY,v TEXT)')
        self.db.execute('CREATE TABLE IF NOT EXISTS states(k TEXT PRIMARY KEY, score1 REAL, score2 REAL, score3 REAL, score5 REAL, broken INTEGER, pairmask INTEGER, empty INTEGER, pinkyok INTEGER, data BLOB)')
        for name in ['score1', 'score2', 'score3', 'score5']:
            self.db.execute(f'CREATE INDEX IF NOT EXISTS {name}_idx ON states({name})')
        contract = dict(configSha256=sha(CONFIG), runnerSha256=sha(__file__), pinkyCap=pinky_cap)
        prior = self.db.execute("SELECT v FROM meta WHERE k='contract'").fetchone()
        if prior:
            assert json.loads(prior[0]) == contract, 'resume algorithm/input contract changed'
            self.state = json.loads(self.db.execute("SELECT v FROM meta WHERE k='state'").fetchone()[0])
        else:
            now = time.time()
            self.state = dict(startedUtc=now, nextReviewUtc=now+3600, reviewCount=0, samples=0,
                              exactSeconds={lane:0. for lane in LANES}, evaluations={lane:0 for lane in LANES},
                              cacheHits={lane:0 for lane in LANES}, maxBroken={lane:0 for lane in LANES},
                              stagnantReviews={lane:0 for lane in LANES}, capSinceReview={lane:0 for lane in LANES},
                              capSinceUtc={lane:now for lane in LANES},
                              previousBest={lane:None for lane in LANES},
                              rng={lane:20261121+(i+1)*104729 for i, lane in enumerate(LANES)},
                              queues={lane:[] for lane in LANES}, pairOrder={lane:list(range(7)) for lane in LANES},
                              chains={lane:[] for lane in LANES}, nextChain={lane:0 for lane in LANES},
                              temperatureScale={lane:1. for lane in LANES})
            self.db.execute('INSERT INTO meta VALUES (?,?)', ('contract',dump(contract)))
            self.save()
        self.last_status = 0

    def save(self):
        self.db.execute('INSERT OR REPLACE INTO meta VALUES (?,?)', ('state',dump(self.state)))
        self.db.commit()

    def cached(self, finals):
        key = ''.join(chr(k+65) for k in finals)
        row = self.db.execute('SELECT data FROM states WHERE k=?', (key,)).fetchone()
        return json.loads(zlib.decompress(row[0])) if row else None

    def store(self, row):
        pinkyok = row['rightPinkyMixed'] <= self.cfg['rightPinkyCaps']['mixed']+1e-12 and row['rightPinkyPeak8'] <= self.cfg['rightPinkyCaps']['peak8']+1e-12
        self.db.execute('INSERT OR IGNORE INTO states VALUES (?,?,?,?,?,?,?,?,?,?)',
                        (row['key'], *row['scores'], len(row['broken']),sum(1<<i for i in row['broken']),row['emptyBuckets'],
                         int(pinkyok), zlib.compress(dump(row).encode())))

    def eligible(self, row, lane):
        return (legal(row['finals'], self.cfg, lane, self.state['maxBroken'][lane]) and
                (not self.pinky_cap or row['rightPinkyMixed'] <= self.cfg['rightPinkyCaps']['mixed']+1e-12 and
                 row['rightPinkyPeak8'] <= self.cfg['rightPinkyCaps']['peak8']+1e-12))

    def top(self, lane, axis, limit=2, max_broken=None):
        cap = self.state['maxBroken'][lane] if max_broken is None else max_broken
        where = 'broken<=?'+(' AND empty=1' if lane == 'strict' else '')+(' AND pinkyok=1' if self.pinky_cap else '')
        column = ['score1','score2','score3','score5'][axis]
        rows = self.db.execute(f'SELECT data FROM states WHERE {where} ORDER BY {column} LIMIT ?', (cap,limit)).fetchall()
        return [json.loads(zlib.decompress(r[0])) for r in rows]

    def light(self, row):
        return {k:v for k,v in row.items() if k != 'modes'}

    def proposal(self, lane):
        state, cfg = self.state, self.cfg
        rng = Rng(state['rng'][lane])
        if state['queues'][lane]:
            item = state['queues'][lane].pop(0)
            state['rng'][lane] = rng.state
            return item['finals'], dict(kind=item['kind'], chain=None)
        chains = state['chains'][lane]
        if len(chains) < 8:
            finals = construct_grouped(cfg, lane, rng, anchor_e=len(chains)%2 == 0)
            state['rng'][lane] = rng.state
            return finals, dict(kind='grouped initialization', chain=None)
        index = state['nextChain'][lane] % len(chains)
        state['nextChain'][lane] = (index+1) % len(chains)
        chain = chains[index]
        at = chain['steps'] % 600
        restart = chain['steps'] > 0 and at == 0
        if restart and rng.random() < .25:
            base = construct_grouped(cfg,lane,rng,anchor_e=index%2 == 0)
        else:
            base = chain['best']['finals'] if restart else chain['current']['finals']
        for attempt in range(8000):
            candidate = list(base)
            count = 6+int(rng.random()*5) if restart else 2+int(rng.random()*3) if at < 180 else 1
            for _ in range(count):
                candidate = mutate_once(candidate,cfg,rng,state['maxBroken'][lane],state['pairOrder'][lane])
            if candidate != chain['current']['finals'] and legal(candidate,cfg,lane,state['maxBroken'][lane]):
                state['rng'][lane] = rng.state
                return candidate, dict(kind='reheat' if restart else 'coarse' if at < 180 else 'fine', chain=index)
        raise RuntimeError('no legal proposal after 8000 attempts')

    def accept(self, lane, row, proposal):
        state = self.state
        if not self.eligible(row,lane):
            return
        light = self.light(row)
        chains = state['chains'][lane]
        if proposal['chain'] is None:
            if len(chains) < 8:
                index = len(chains)
                chains.append(dict(index=index, axis=index%4, current=light, best=light, steps=0, accepted=0))
            else:
                axis = min(range(4),key=lambda i:row['scores'][i]-self.cfg['expectedSeedScores'][i])
                index = axis
                c = chains[index]
                c['current'] = light
                if row['scores'][axis] < c['best']['scores'][axis]:
                    c['best'] = light
            return
        c = chains[proposal['chain']]
        rng = Rng(state['rng'][lane])
        at = c['steps'] % 600
        temperature = (.09*(.008/.09)**(at/179) if at < 180 else
                       .012*(.00005/.012)**((at-180)/419))*state['temperatureScale'][lane]
        delta = row['scores'][c['axis']]-c['current']['scores'][c['axis']]
        if proposal['kind'] == 'reheat' or delta <= 0 or rng.random() < math.exp(-delta/temperature):
            c['current'] = light
            c['accepted'] += 1
        if row['scores'][c['axis']] < c['best']['scores'][c['axis']]:
            c['best'] = light
        c['steps'] += 1
        state['rng'][lane] = rng.state

    def review(self, now=None, forced=False):
        now = now or time.time()
        state, cfg = self.state, self.cfg
        state['reviewCount'] += 1
        index = state['reviewCount']
        report = dict(utc=now,index=index,engine='deterministic rules; no model/API calls',
                      exactSeconds=dict(state['exactSeconds']),lanes={},transfers=[],
                      groupRelaxationRequires='>=2 real hours at protected startup, >=2 stagnant hourly reviews per cap, >=400 lane exact scores')
        live_cap = {}
        for lane in LANES:
            leaders = [self.top(lane,a,1) for a in range(4)]
            best = [r[0]['scores'][a] if r else None for a,r in enumerate(leaders)]
            prior = state['previousBest'][lane]
            improved = prior is None or any(a is not None and b is not None and a < b-.0001 for a,b in zip(best,prior))
            state['stagnantReviews'][lane] = 0 if improved else state['stagnantReviews'][lane]+1
            if prior is None:
                state['stagnantReviews'][lane] = 1  # first complete hour is an observed plateau baseline.
            state['previousBest'][lane] = best
            old_cap = state['maxBroken'][lane]
            mature = now-state['startedUtc'] >= cfg['review']['initialProtectedHours']*3600
            stalled = state['stagnantReviews'][lane] >= cfg['review']['stagnantReviewsBeforeSplit']
            enough = state['evaluations'][lane] >= cfg['review']['minimumExactSamplesBeforeSplit']
            changed = False
            cap_mature = now-state['capSinceUtc'][lane] >= 2*3600
            if mature and cap_mature and stalled and enough and old_cap < 7 and index-state['capSinceReview'][lane] >= 2:
                state['maxBroken'][lane] += 1
                state['capSinceReview'][lane] = index
                state['capSinceUtc'][lane] = now
                state['stagnantReviews'][lane] = 0
                changed = True
            if not improved:
                state['temperatureScale'][lane] = min(2.,state['temperatureScale'][lane]*1.15)
            else:
                state['temperatureScale'][lane] = 1.
            # Rank pair-release evidence from actual cached layouts; unknown pairs are probed next.
            evidence = []
            for pair in range(7):
                where = 'broken<=? AND (pairmask & ?)<>0'+(' AND empty=1' if lane=='strict' else '')+(' AND pinkyok=1' if self.pinky_cap else '')
                minima = self.db.execute('SELECT MIN(score1),MIN(score2),MIN(score3),MIN(score5) FROM states WHERE '+where,
                                         (state['maxBroken'][lane],1<<pair)).fetchone()
                delta = min((value-best[a] for a,value in enumerate(minima)
                             if value is not None and best[a] is not None),default=None)
                evidence.append(dict(pair=cfg['preferredPairs'][pair],index=pair,bestDelta=delta))
            evidence.sort(key=lambda e:(e['bestDelta'] is None,e['bestDelta'] if e['bestDelta'] is not None else 0))
            state['pairOrder'][lane] = [e['index'] for e in evidence]
            if changed and any(leaders):
                center = next(r[0] for r in leaders if r)
                for pair in state['pairOrder'][lane]:
                    for f in pair_indices(cfg)[pair]:
                        for key in cfg['allowedKeys']:
                            candidate = list(center['finals'])
                            candidate[f] = key
                            if legal(candidate,cfg,lane,state['maxBroken'][lane]) and candidate != center['finals']:
                                state['queues'][lane].append(dict(finals=candidate,kind='evidence-guided pair split probe'))
            report['lanes'][lane] = dict(bestScores=best,deltaFrom3158=[a-b if a is not None else None for a,b in zip(best,cfg['expectedSeedScores'])],
                maxBrokenBefore=old_cap,maxBrokenAfter=state['maxBroken'][lane],changedStrategy=changed,
                strategy='release one additional pair and probe all pair identities' if changed else 'retain pair cap; adapt heat and transfer leaders',
                temperatureScale=state['temperatureScale'][lane],pairEvidence=evidence,
                exactEvaluations=state['evaluations'][lane],leaders=[self.light(r[0]) if r else None for r in leaders])
            live_cap[lane] = state['maxBroken'][lane]
        # Cross-lane leaders share the same exact cache. Open -> strict needs empty-bucket repair.
        for target, origin in [('strict','open'),('open','strict')]:
            selected = {r['key']:r for a in range(4) for r in self.top(origin,a,2)}
            rng = Rng(state['rng'][target])
            for row in selected.values():
                fm = row['finals']
                if legal(fm,cfg,target,live_cap[target]):
                    if self.eligible(row,target):
                        state['queues'][target].append(dict(finals=fm,kind='cross-lane cached leader'))
                        report['transfers'].append(dict(origin=origin,target=target,id=row['id'],kind='exact cached leader'))
                elif target == 'strict':
                    # Group-preserving matching reassigns forbidden Q/Z targets; exact replay still required.
                    repaired = construct_grouped(cfg,'strict',rng,preferred=fm,anchor_e=row['eiErAtE'])
                    state['queues'][target].append(dict(finals=repaired,kind='cross-lane grouped QZ repair'))
                    report['transfers'].append(dict(origin=origin,target=target,id=row['id'],kind='proposed grouped empty-bucket repair'))
            state['rng'][target] = rng.state
        # Keep queues bounded and unique. User-specified caps are never increased by transfers.
        for lane in LANES:
            unique = {}
            for item in state['queues'][lane]:
                if legal(item['finals'],cfg,lane,state['maxBroken'][lane]):
                    unique.setdefault(tuple(item['finals']),item)
            state['queues'][lane] = list(unique.values())[:500]
        total = sum(state['exactSeconds'].values())
        report['strictExactFraction'] = state['exactSeconds']['strict']/total if total else None
        state['nextReviewUtc'] = now+3600
        self.save()
        atomic(self.work/'reviews'/f'hour-{index:03d}.json',report)
        with (self.work/'review-history.jsonl').open('a',encoding='utf8') as f:
            f.write(dump({k:v for k,v in report.items() if k != 'lanes'})+'\n')
        return report

    def status(self, state, scorer=None, **extra):
        report = dict(state=state,pid=os.getpid(),updatedUtc=time.time(),backend='cpu-only',
                      seed=self.cfg['seedId'],policy=self.cfg['policies'],maxMemory=41,maxD=2,maxV=5,
                      hardPinkyCap=self.pinky_cap,exactSeconds=self.state['exactSeconds'],
                      evaluations=self.state['evaluations'],cacheHits=self.state['cacheHits'],
                      maxBrokenPairs=self.state['maxBroken'],reviewCount=self.state['reviewCount'],
                      nextReviewUtc=self.state['nextReviewUtc'],preferredPairs=self.cfg['preferredPairs'],
                      provisionalFixedPolicy=True,**extra)
        if scorer:
            report.update(nativePid=scorer.process.pid,logicalCpuAffinity=scorer.affinity)
        total = sum(self.state['exactSeconds'].values())
        report['strictExactFraction'] = self.state['exactSeconds']['strict']/total if total else None
        report['lanes'] = {lane:{str(mult):[self.light(r) for r in self.top(lane,a,3)]
                                for a,mult in enumerate(MULTIPLIERS)} for lane in LANES}
        atomic(self.work/'status.json',report)
        atomic(self.work/'frontier.json',dict(updatedUtc=report['updatedUtc'],lanes=report['lanes'],
                                             contract='fixed seed robust policy; own-policy final verification required'))
        self.last_status = time.monotonic()

    def close(self):
        self.save()
        self.db.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work',type=Path,default=ROOT/'research/.cache/u7e-grouped-cpu-20261121')
    parser.add_argument('--hours',type=float,default=24)
    parser.add_argument('--duty',type=float,default=.65)
    parser.add_argument('--max-evaluations',type=int)
    parser.add_argument('--pinky-cap',action='store_true')
    parser.add_argument('--audit-only',action='store_true')
    parser.add_argument('--status',action='store_true')
    args = parser.parse_args()
    assert 0 < args.duty <= 1 and args.hours > 0
    work = args.work.resolve()
    if args.status:
        print((work/'status.json').read_text(encoding='utf8'))
        return
    work.mkdir(parents=True,exist_ok=True)
    (work/'reviews').mkdir(exist_ok=True)
    # Kernel-held lock is released even if the process is terminated, unlike a stale PID marker.
    lock = (work/'campaign.lock').open('a+b')
    lock.seek(0)
    if lock.read(1) == b'':
        lock.write(b'0')
        lock.flush()
    lock.seek(0)
    if os.name == 'nt':
        import msvcrt
        msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
        psutil.Process().nice(psutil.BELOW_NORMAL_PRIORITY_CLASS)
    cfg = json.loads(CONFIG.read_text(encoding='utf8'))
    for p,digest in cfg['sourceHashes'].items():
        assert sha(p) == digest,p
    campaign, scorer = None,None
    started = time.monotonic()
    try:
        campaign = Campaign(work,cfg,args.pinky_cap)
        campaign.status('starting',duty=args.duty)
        scorer = Scorer(cfg,work)
        control, seconds = scorer.score(cfg['seedFinalKeys'],cfg)
        for a,b in zip(control['scores'],cfg['expectedSeedScores']):
            assert abs(a-b)<1e-9,('seed score mismatch',a,b)
        for mode in ['keytao','sanpin']:
            for kind in KINDS:
                for field,value in cfg['seedModes'][mode][kind].items():
                    if isinstance(value,(float,int)):
                        assert abs(value-control['modes'][mode][kind][field])<1e-8,(mode,kind,field)
        campaign.store(control)
        campaign.save()
        atomic(work/'baseline-audit.json',dict(completed=True,backend='cpu-only',scores=control['scores'],
               expected=cfg['expectedSeedScores'],maximumTrackErrorBelow1eMinus8=True,
               seconds=seconds,nativePid=scorer.process.pid,logicalCpuAffinity=scorer.affinity,
               sourceHashes={str(CONFIG):sha(CONFIG),str(Path(__file__)):sha(__file__)}))
        if args.audit_only:
            campaign.status('audited',scorer,duty=args.duty)
            return
        final_state = 'completed_time_budget'
        while time.monotonic()-started < args.hours*3600:
            if (work/'STOP').exists():
                final_state = 'stopped'
                break
            if (work/'PAUSE').exists():
                if time.monotonic()-campaign.last_status>30:
                    campaign.status('paused',scorer,duty=args.duty)
                time.sleep(2)
                continue
            duty = args.duty
            if (work/'control.json').exists():
                controls = json.loads((work/'control.json').read_text(encoding='utf8'))
                duty = max(.05,min(1,float(controls.get('duty',duty))))
            now = time.time()
            if now >= campaign.state['nextReviewUtc'] or (work/'REVIEW_NOW').exists():
                force = (work/'REVIEW_NOW').exists()
                if force:
                    (work/'REVIEW_NOW').unlink()
                campaign.review(now,forced=force)
                campaign.status('running',scorer,duty=duty)
            lane = choose_lane(campaign.state['exactSeconds'])
            finals, proposal = campaign.proposal(lane)
            row = campaign.cached(finals)
            exact_seconds = 0
            if row is None:
                row, exact_seconds = scorer.score(finals,cfg)
                campaign.store(row)
                campaign.state['samples'] += 1
                campaign.state['evaluations'][lane] += 1
                campaign.state['exactSeconds'][lane] += exact_seconds
            else:
                campaign.state['cacheHits'][lane] += 1
            campaign.accept(lane,row,proposal)
            campaign.save()
            if time.monotonic()-campaign.last_status >= 30:
                campaign.status('running',scorer,duty=duty)
            if args.max_evaluations and campaign.state['samples'] >= args.max_evaluations:
                final_state = 'completed_evaluation_budget'
                break
            until = time.monotonic()+max(.002,exact_seconds*(1/duty-1))
            while time.monotonic()<until and not (work/'STOP').exists():
                time.sleep(min(.5,max(0,until-time.monotonic())))
        campaign.status(final_state,scorer,duty=args.duty)
    except BaseException as error:
        if campaign:
            campaign.status('error',scorer,error=repr(error))
        raise
    finally:
        if scorer:
            scorer.close()
        if campaign:
            campaign.close()
        lock.close()


if __name__ == '__main__':
    main()
