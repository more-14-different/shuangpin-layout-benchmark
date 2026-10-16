set shell := ["pwsh", "-NoLogo", "-NoProfile", "-Command"]

ckt-v4-fixture:
    node tools/export_ckt_v4_kernel_fixture.js --output tests/fixtures/ckt_v4_kernel_reference.json

ckt-v4-js-test:
    node --test tests/*.test.mjs

ckt-v4-rust-fmt:
    cargo fmt --manifest-path research/ckt-v4-core/Cargo.toml --check

ckt-v4-rust-test:
    cargo test --manifest-path research/ckt-v4-core/Cargo.toml

ckt-v4-rust-verify: ckt-v4-fixture ckt-v4-rust-fmt ckt-v4-rust-test

ckt-v4-real-fixture ids="S005,L600":
    node tools/export_ckt_v4_real_fixture.js --ids "{{ids}}" --output research/.cache/ckt-v4-real-reference.json

ckt-v4-real-verify:
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin verify-real -- research/.cache/ckt-v4-real-reference.json tools/ckt_v4_upstream_role_tables.json

ckt-v4-real-incremental-smoke:
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin verify-real -- research/.cache/ckt-v4-real-reference.json tools/ckt_v4_upstream_role_tables.json --incremental-smoke

ckt-v4-binary-fixture ids="S005,L600":
    node tools/export_ckt_v4_binary_fixture.js --ids "{{ids}}" --output research/.cache/ckt-v4-real-reference.bin

ckt-v4-binary-verify:
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin verify-binary -- research/.cache/ckt-v4-real-reference.bin tools/ckt_v4_upstream_role_tables.json

ckt-v4-binary-incremental-smoke:
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin verify-binary -- research/.cache/ckt-v4-real-reference.bin tools/ckt_v4_upstream_role_tables.json --incremental-smoke

ckt-v4-native-corpus ids="S005,L600,S005-NF,SNF4-M36-AE-07":
    node tools/export_ckt_v4_native_corpus.js --ids "{{ids}}" --output research/.cache/ckt-v4-native-corpus.bin --schemes research/.cache/ckt-v4-schemes.json

ckt-v4-native-verify:
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin verify-native -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-schemes.json research/.cache/ckt-v4-real-reference.bin tools/ckt_v4_upstream_role_tables.json

ckt-v4-native-incremental-smoke:
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin verify-native -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-schemes.json research/.cache/ckt-v4-real-reference.bin tools/ckt_v4_upstream_role_tables.json --incremental-smoke

ckt-v4-native-score:
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin score-native -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-schemes.json tools/ckt_v4_upstream_role_tables.json

ckt-v4-anneal scheme="S005-NF" steps="100" checkpoint="research/checkpoints/ckt-v4-anneal.json":
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin anneal-native -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-schemes.json tools/ckt_v4_upstream_role_tables.json "{{scheme}}" --steps "{{steps}}" --checkpoint "{{checkpoint}}" --checkpoint-every 10 --verify-every 50 --duty-ms 5

ckt-v4-anneal-resume scheme="S005-NF" steps="100" checkpoint="research/checkpoints/ckt-v4-anneal.json":
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin anneal-native -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-schemes.json tools/ckt_v4_upstream_role_tables.json "{{scheme}}" --steps "{{steps}}" --checkpoint "{{checkpoint}}" --checkpoint-every 10 --verify-every 50 --duty-ms 5 --resume
