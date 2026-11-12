# Run from repository root. Frozen production/corpus caches are prerequisites.
comfort-production:
    python tools/search_toned_dual_empty_regroup.py --prefix research/.cache/comfort-r0 --tag CF0 --production --require-empty --operators root,key,first,coupled
    python tools/screen_toned_comfort.py research/.cache/comfort-r0
    python tools/run_toned_neighbor_shards.py research/.cache/comfort-r0 --workers 6
    python tools/screen_toned_comfort.py research/.cache/comfort-r0 --select
    python tools/export_toned_rhyme_neighbors.py --job research/.cache/comfort-r0-selected-job.json --results research/.cache/comfort-r0-selected-scores.json --prefix research/notes/2026-11-13-comfort-free --all

comfort-benchmark name:
    node tools/benchmark_toned_representatives.js --layouts research/notes/2026-11-13-{{name}}-finalists.json --prefix research/notes/2026-11-13-{{name}}-benchmark --macro-input research/.cache/{{name}}-macro.json

comfort-report:
    python tools/report_toned_comfort.py comfort-qz comfort-free comfort-next
