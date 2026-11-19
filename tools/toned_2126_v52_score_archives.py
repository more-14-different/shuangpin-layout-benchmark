"""Resolve score archives and publish bounded gzip parts without losing rows."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def score_archives(prefix):
    index=Path(str(prefix)+'-scores-index.json')
    if not index.exists():return [Path(str(prefix)+'-scores.jsonl.gz')]
    metadata=json.loads(index.read_text(encoding='utf8'))
    return [ROOT/part['file'] for part in metadata['parts']]


def publish(prefix,rows_per_part=20000):
    prefix=Path(prefix).resolve();prefix.relative_to(ROOT)
    index=Path(str(prefix)+'-scores-index.json');archive=Path(str(prefix)+'-scores.jsonl.gz')
    report=json.loads(Path(str(prefix)+'.json').read_text(encoding='utf8'));assert report['complete']
    if index.exists():
        metadata=json.loads(index.read_text(encoding='utf8'))
        assert all(sha(ROOT/p['file'])==p['sha256'] for p in metadata['parts'])
        print('Already published',len(metadata['parts']),'score parts');return
    assert sha(archive)==report['scoresSha256'];parts=[];buffer=[];raw_hash=hashlib.sha256()
    def flush():
        if not buffer:return
        part=Path(str(prefix)+f'-scores-{len(parts)+1:04d}.jsonl.gz')
        part.write_bytes(gzip.compress(b''.join(buffer),mtime=0))
        parts.append(dict(file=part.relative_to(ROOT).as_posix(),rows=len(buffer),sha256=sha(part)))
        buffer.clear()
    with gzip.open(archive,'rb') as stream:
        for line in stream:
            json.loads(line);buffer.append(line);raw_hash.update(line)
            if len(buffer)==rows_per_part:flush()
    flush();assert sum(p['rows'] for p in parts)==report['newFullEvaluations']
    metadata=dict(version=1,aggregateSha256=report['scoresSha256'],uncompressedSha256=raw_hash.hexdigest(),rows=sum(p['rows'] for p in parts),parts=parts)
    index.write_text(json.dumps(metadata,indent=2)+'\n',encoding='utf8')
    # Retain the original aggregate in the ignored task cache. Parts are the
    # portable publication; each stays comfortably below Git hosting limits.
    destination=ROOT/'research/.cache'/prefix.name/'scores-aggregate.jsonl.gz'
    assert destination.resolve().is_relative_to((ROOT/'research/.cache').resolve())
    destination.parent.mkdir(parents=True,exist_ok=True)
    if destination.exists():assert sha(destination)==metadata['aggregateSha256']
    archive.replace(destination)
    print('Published',metadata['rows'],'rows in',len(parts),'parts')


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--prefix',type=Path,required=True)
    p.add_argument('--rows-per-part',type=int,default=20000);a=p.parse_args()
    if a.rows_per_part<1:p.error('--rows-per-part must be positive')
    publish(a.prefix,a.rows_per_part)


if __name__=='__main__':main()
