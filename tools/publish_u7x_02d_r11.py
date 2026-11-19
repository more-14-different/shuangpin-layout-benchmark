"""Replay all ordinary R11 benchmark columns before installing the U7X frontier."""
import argparse
import gzip
import hashlib
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
CONFIG=ROOT/'research/config/u7x-02d-r11-candidate.json'
PREFIX=ROOT/'research/notes/2026-11-20-u7x-02d-r11'

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--html',type=Path,default=ROOT/'a7_CKT_R11.html')
    args=parser.parse_args()
    config=json.loads(CONFIG.read_text(encoding='utf-8'))
    raw=gzip.decompress((ROOT/'research/config/untoned-2121-reviewed-integrator.py.gz').read_bytes())
    assert hashlib.sha256(raw).hexdigest()==config['archivedIntegratorSha256']
    # The reviewed historical integrator has private exact-replay inputs/outputs.
    # Load its frozen implementation while resolving shared modules in this checkout.
    with tempfile.TemporaryDirectory(prefix='u7x-reviewed-integrator-') as tmp:
        modulepath=Path(tmp)/'integrator.py'
        modulepath.write_bytes(raw)
        spec=importlib.util.spec_from_file_location('u7x_reviewed_integrator',modulepath)
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.ROOT=ROOT
        module.patch_production_ui=lambda html:html
        sys.argv=[str(modulepath),'--html',str(args.html.resolve()),'--replay',str(ROOT/'research/.cache/R11_integrated_replay'),
            '--candidate-file',str(CONFIG),'--audit',str(PREFIX)+'-columns.json','--fresh']
        module.main()

if __name__=='__main__':main()
