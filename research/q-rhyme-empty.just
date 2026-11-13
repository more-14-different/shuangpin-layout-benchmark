# Repository-root invocation; prior frozen corpus and seed cache required.
q-rhyme-initial:
    python tools/search_toned_dual_empty_regroup.py --prefix research/.cache/q-rhyme-r0 --tag QR0 --seed-file research/.cache/q-rhyme-seeds.json --require-empty --operators key --q-empty-rhyme
    cargo build --release --manifest-path research/ckt-v4-core/Cargo.toml --bin audit-toned-rhyme-neighbors
    python tools/run_toned_neighbor_shards.py research/.cache/q-rhyme-r0 --workers 4
    python tools/screen_toned_comfort.py research/.cache/q-rhyme-r0

q-rhyme-refine:
    python tools/search_toned_dual_empty_regroup.py --prefix research/.cache/q-rhyme-r1 --tag QR1 --previous research/.cache/q-rhyme-r0 --leaders 2 --require-empty --operators root,key,first --q-empty-rhyme
    python tools/run_toned_neighbor_shards.py research/.cache/q-rhyme-r1 --workers 8
    python tools/screen_toned_comfort.py research/.cache/q-rhyme-r1

q-rhyme-report:
    python tools/report_q_rhyme_empty.py --collect q-rhyme-r0 q-rhyme-r1
    node tools/benchmark_toned_representatives.js --layouts research/notes/2026-11-13-q-rhyme-empty-finalists.json --prefix research/notes/2026-11-13-q-rhyme-empty-benchmark --macro-input research/.cache/q-rhyme-macro.json
    python tools/report_q_rhyme_empty.py
