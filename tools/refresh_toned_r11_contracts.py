"""Recompute all published toned columns serially, then publish atomically."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / 'a7_CKT_R11_integrated_materials/toned-contract-audit'


def run(*args):
    subprocess.run(args, cwd=ROOT, check=True)


if __name__ == '__main__':
    run('node', '--max-old-space-size=4096', 'tools/refresh_toned_r11_contracts.js', 'prepare')
    ids = json.loads((DESTINATION / 'manifest.json').read_text(encoding='utf8'))['ids']
    for ident in ids:
        run('node', '--max-old-space-size=4096', 'tools/score_toned_benchmark_columns.js',
            '--native', str(DESTINATION / (ident + '.native.json')),
            '--output', str(DESTINATION / (ident + '.columns.json')))
    run('node', '--max-old-space-size=4096', 'tools/refresh_toned_r11_contracts.js', 'publish')
    run('python', '-X', 'utf8', 'tools/integrate_snow_jiandao_toned_r11.py', '--ui-only')
    run('node', 'tools/sync_keymap_link_colors.js')
