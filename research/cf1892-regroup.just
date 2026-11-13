# Run from repository root. Audit JSON preserves the seed state.
cf1892-initial:
    python tools/search_toned_dual_empty_regroup.py --prefix research/.cache/cf1892-r0 --tag CR0 --seed-file research/.cache/cf1892-seed.json --require-empty --max-m 22 --max-guard 24 --operators root,key,coupled
    python tools/screen_toned_comfort.py research/.cache/cf1892-r0
    python tools/run_toned_neighbor_shards.py research/.cache/cf1892-r0 --workers 8

cf1892-erv:
    python tools/search_toned_dual_empty_regroup.py --prefix research/.cache/cf1892-erv --tag CRE --seed-file research/.cache/cf1892-seed.json --require-empty --max-m 22 --max-guard 24 --operators erv
    python tools/screen_toned_comfort.py research/.cache/cf1892-erv
    python tools/run_toned_neighbor_shards.py research/.cache/cf1892-erv --workers 3

cf1892-refine:
    python tools/search_toned_dual_empty_regroup.py --prefix research/.cache/cf1892-r1 --tag CR1 --previous research/.cache/cf1892-r0 --leaders 2 --require-empty --max-m 22 --max-guard 24 --operators root,key,erv --exclude research/.cache/cf1892-r0 --exclude research/.cache/cf1892-erv
    python tools/screen_toned_comfort.py research/.cache/cf1892-r1
    python tools/run_toned_neighbor_shards.py research/.cache/cf1892-r1 --workers 8

cf1892-report:
    python tools/report_cf1892_regroup.py --collect cf1892-r0 cf1892-erv cf1892-r1
    node tools/benchmark_toned_representatives.js --layouts research/notes/2026-11-13-cf1892-regroup-finalists.json --prefix research/notes/2026-11-13-cf1892-regroup-benchmark --macro-input research/.cache/cf1892-macro.json
    python tools/report_cf1892_regroup.py
