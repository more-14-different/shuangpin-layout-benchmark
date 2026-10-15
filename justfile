set shell := ["pwsh", "-NoLogo", "-NoProfile", "-Command"]

ckt-v4-fixture:
    node tools/export_ckt_v4_kernel_fixture.js --output tests/fixtures/ckt_v4_kernel_reference.json

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
