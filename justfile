set shell := ["pwsh", "-NoLogo", "-NoProfile", "-Command"]

ckt-v4-fixture:
    node tools/export_ckt_v4_kernel_fixture.js --output tests/fixtures/ckt_v4_kernel_reference.json

ckt-v4-js-test:
    node --test tests/*.test.mjs

ckt-v4-rust-fmt:
    cargo fmt --manifest-path research/ckt-v4-core/Cargo.toml --check

ckt-v4-rust-test:
    cargo test --manifest-path research/ckt-v4-core/Cargo.toml

ckt-v4-search-test:
    cargo test --manifest-path research/ckt-v4-core/Cargo.toml --test search_proposals
    cargo test --manifest-path research/ckt-v4-core/Cargo.toml --test anneal_resume

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

ckt-v4-native-corpus ids="S005,L600,S005-NF,SNF4-M36-AE-07,N095,SNOW-SHENYUN-21X28-SHAPE,H37":
    node tools/export_ckt_v4_native_corpus.js --ids "{{ids}}" --output research/.cache/ckt-v4-native-corpus.bin --schemes research/.cache/ckt-v4-schemes.json

ckt-v4-all-scheme-fixture:
    node tools/export_ckt_v4_scheme_fixture.js --ids all --output research/.cache/ckt-v4-all-schemes.json

ckt-v4-capability-audit: ckt-v4-all-scheme-fixture
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin audit-capabilities -- research/.cache/ckt-v4-all-schemes.json research/.cache/ckt-v4-capabilities.json
    $fixture = Get-Content -Raw research/.cache/ckt-v4-all-schemes.json | ConvertFrom-Json; $audit = Get-Content -Raw research/.cache/ckt-v4-capabilities.json | ConvertFrom-Json; if ($fixture.schemes.Count -ne $audit.schemes.Count) { throw "capability record count does not match fixture" }; foreach ($id in @('N095', 'H37')) { $record = $audit.schemes | Where-Object id -EQ $id; if ($null -eq $record -or -not $record.forwardScore -or $record.regularAnneal) { throw "$id capability boundary changed" } }; foreach ($id in @('S005-NF', 'SNF4-M36-AE-07', 'SNOW-SHENYUN-21X28-SHAPE')) { $record = $audit.schemes | Where-Object id -EQ $id; if ($null -eq $record -or -not $record.forwardScore -or -not $record.regularAnneal -or $record.reasonCode -ne 'supported') { throw "$id regular capability changed" } }

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

ckt-v4-anneal-guarded scheme="SNF4-M36-AE-07" steps="100" max_memory="36" max_d="3" max_v="0" checkpoint="research/checkpoints/ckt-v4-guarded.json":
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin anneal-native -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-schemes.json tools/ckt_v4_upstream_role_tables.json "{{scheme}}" --steps "{{steps}}" --max-memory "{{max_memory}}" --max-d "{{max_d}}" --max-v "{{max_v}}" --checkpoint "{{checkpoint}}" --checkpoint-every 10 --verify-every 50 --duty-ms 5

ckt-v4-anneal-proposal scheme="S005-NF" proposal="final-token-move" checkpoint="research/checkpoints/ckt-v4-proposal-audit.json":
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin anneal-native -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-schemes.json tools/ckt_v4_upstream_role_tables.json "{{scheme}}" --steps 1 --proposal "{{proposal}}" --checkpoint "{{checkpoint}}" --checkpoint-every 0 --verify-every 1 --duty-ms 0

ckt-v4-frontier-smoke scheme="SNF4-M36-AE-07" checkpoint="research/checkpoints/ckt-v4-frontier-smoke.json" log="research/checkpoints/ckt-v4-frontier-smoke.jsonl" output="research/checkpoints/ckt-v4-frontier-smoke-output.json":
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin anneal-native -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-schemes.json tools/ckt_v4_upstream_role_tables.json "{{scheme}}" --steps 1 --proposal head-pair-regroup --checkpoint "{{checkpoint}}" --checkpoint-every 0 --verify-every 1 --duty-ms 0 --frontier-log "{{log}}" --record leaders
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin merge-frontier -- "{{log}}" "{{output}}"
