set working-directory := '..'

build:
    cargo build --locked --release --features cuda --jobs 2 --manifest-path research/ckt-v4-core/Cargo.toml --bin score-toned-stream

audit: build
    python tools/run_cr_anneal.py --audit-only

run: build
    python tools/run_cr_anneal.py

test:
    python -m unittest discover -s tests -p test_cr_anneal.py
    node --test tests/auxiliary-semantics.test.mjs
