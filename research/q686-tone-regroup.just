# Run from repository root; frozen seed is also preserved in the audit JSON.
set working-directory := '..'

q686-restore-seed:
    python -c "import json; from pathlib import Path; p=Path('research/notes/2026-11-13-q686-tone-regroup-audit.json'); Path('research/.cache/q686-seed.json').write_text(json.dumps(json.loads(p.read_text(encoding='utf8'))['inputSeed'],ensure_ascii=False,indent=2),encoding='utf8')"

q686-initial mode tag swap="":
    python tools/search_toned_dual_empty_regroup.py --prefix research/.cache/q686-{{mode}} --tag {{tag}} --seed-file research/.cache/q686-seed.json --require-empty --max-m 23 --max-guard 25 --operators root,key,erv --q-empty-rhyme {{swap}}
    python tools/screen_toned_comfort.py research/.cache/q686-{{mode}}
    python tools/run_toned_neighbor_shards.py research/.cache/q686-{{mode}} --workers 4

q686-refine mode tag swap="":
    python tools/search_toned_dual_empty_regroup.py --prefix research/.cache/q686-{{mode}}-r1 --tag {{tag}} --previous research/.cache/q686-{{mode}} --leaders 1 --require-empty --max-m 23 --max-guard 25 --operators root,key,erv,coupled --q-empty-rhyme --exclude research/.cache/q686-{{mode}} {{swap}}
    python tools/screen_toned_comfort.py research/.cache/q686-{{mode}}-r1
    python tools/run_toned_neighbor_shards.py research/.cache/q686-{{mode}}-r1 --workers 4

q686-collect:
    python tools/report_q686_tone_regroup.py --collect q686-keep q686-swap q686-keep-r1 q686-swap-r1

q686-benchmark name:
    node tools/benchmark_toned_representatives.js --layouts research/notes/2026-11-13-{{name}}-finalists.json --prefix research/notes/2026-11-13-{{name}}-benchmark --macro-input research/.cache/{{name}}-macro.json

q686-report:
    python tools/report_q686_tone_regroup.py q686-keep q686-swap q686-keep-r1 q686-swap-r1
