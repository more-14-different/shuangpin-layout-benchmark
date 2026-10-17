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

ckt-v4-ranked-explorer-seeds: ckt-v4-capability-audit
    node tools/select_ckt_v4_explorer_seeds.mjs --results docs/CKT_v4_ALL_SCHEMES_RESULTS.json --capabilities research/.cache/ckt-v4-capabilities.json --schemes research/.cache/ckt-v4-all-schemes.json --capacity 21,21 --count 8 --output research/config/ckt-v4-ranked-seeds-21x21.json
    node tools/select_ckt_v4_explorer_seeds.mjs --results docs/CKT_v4_ALL_SCHEMES_RESULTS.json --capabilities research/.cache/ckt-v4-capabilities.json --schemes research/.cache/ckt-v4-all-schemes.json --capacity 21,26 --count 8 --output research/config/ckt-v4-ranked-seeds-21x26.json

ckt-v4-native-verify:
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin verify-native -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-schemes.json research/.cache/ckt-v4-real-reference.bin tools/ckt_v4_upstream_role_tables.json

ckt-v4-native-incremental-smoke:
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin verify-native -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-schemes.json research/.cache/ckt-v4-real-reference.bin tools/ckt_v4_upstream_role_tables.json --incremental-smoke

ckt-v4-native-score:
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin score-native -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-schemes.json tools/ckt_v4_upstream_role_tables.json

ckt-v4-rank-stats:
    $parts = 'research/.cache/ckt-v4-rank-stats-parts'; $total = (Get-Content -Raw research/.cache/ckt-v4-all-schemes.json | ConvertFrom-Json).schemes.Count; New-Item -ItemType Directory -Force -Path $parts | Out-Null; for ($offset = 0; $offset -lt $total; $offset += 50) { $name = 'part-{0:d3}.json' -f $offset; cargo run --quiet --release --manifest-path research/ckt-v4-core/Cargo.toml --bin export-rank-stats -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-all-schemes.json (Join-Path $parts $name) $offset 50; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }

ckt-v4-rank-fallback:
    $audit = Get-Content -Raw research/.cache/ckt-v4-capabilities.json | ConvertFrom-Json; $ids = (($audit.schemes | Where-Object { -not $_.forwardScore }).id -join ','); if (-not $ids) { throw 'capability audit has no forward-invalid fallback schemes' }; node tools/score_completion_ckt_v4.js --ids $ids --mass 0.99 --no-cross-audit --compact --quiet --output research/.cache/ckt-v4-rank-fallback.json

ckt-v4-rank-prepare:
    node tools/prepare_ckt_v4_rank_upgrade.js

ckt-v4-anneal scheme="S005-NF" steps="100" checkpoint="research/checkpoints/ckt-v4-anneal.json":
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin anneal-native -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-schemes.json tools/ckt_v4_upstream_role_tables.json "{{scheme}}" --steps "{{steps}}" --checkpoint "{{checkpoint}}" --checkpoint-every 10 --verify-every 50 --duty-ms 5

ckt-v4-anneal-resume scheme="S005-NF" steps="100" checkpoint="research/checkpoints/ckt-v4-anneal.json":
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin anneal-native -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-schemes.json tools/ckt_v4_upstream_role_tables.json "{{scheme}}" --steps "{{steps}}" --checkpoint "{{checkpoint}}" --checkpoint-every 10 --verify-every 50 --duty-ms 5 --resume

ckt-v4-anneal-guarded scheme="SNF4-M36-AE-07" steps="100" max_memory="36" max_d="3" max_v="0" checkpoint="research/checkpoints/ckt-v4-guarded.json":
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin anneal-native -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-schemes.json tools/ckt_v4_upstream_role_tables.json "{{scheme}}" --steps "{{steps}}" --max-memory "{{max_memory}}" --max-d "{{max_d}}" --max-v "{{max_v}}" --checkpoint "{{checkpoint}}" --checkpoint-every 10 --verify-every 50 --duty-ms 5

ckt-v4-anneal-proposal scheme="S005-NF" proposal="final-token-move" checkpoint="research/checkpoints/ckt-v4-proposal-audit.json":
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin anneal-native -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-schemes.json tools/ckt_v4_upstream_role_tables.json "{{scheme}}" --steps 1 --proposal "{{proposal}}" --checkpoint "{{checkpoint}}" --checkpoint-every 0 --verify-every 1 --duty-ms 0

ckt-v4-frontier-smoke scheme="SNF4-M36-AE-07" checkpoint="research/checkpoints/ckt-v4-frontier-smoke.json" log="research/checkpoints/ckt-v4-frontier-smoke.jsonl" output="research/checkpoints/ckt-v4-frontier-smoke-output.json":
    foreach ($path in @("{{checkpoint}}", "{{log}}", "{{output}}")) { if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force } }
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin anneal-native -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-schemes.json tools/ckt_v4_upstream_role_tables.json "{{scheme}}" --steps 1 --proposal head-pair-regroup --checkpoint "{{checkpoint}}" --checkpoint-every 0 --verify-every 1 --duty-ms 0 --frontier-log "{{log}}" --record leaders
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin merge-frontier -- "{{log}}" "{{output}}"

ckt-v4-frontier-memory-smoke:
    cargo test --release --manifest-path research/ckt-v4-core/Cargo.toml --test frontier_log writer_memory_does_not_retain_history_while_the_log_grows -- --exact --nocapture

ckt-v4-explore-21x21 config="research/config/ckt-v4-explorer-21x21.example.json": ckt-v4-native-corpus ckt-v4-ergonomic-fixture ckt-v4-ranked-explorer-seeds
    pwsh -NoLogo -NoProfile -File tools/run_ckt_v4_explorer.ps1 -Config "{{config}}"

ckt-v4-explore-21x26 config="research/config/ckt-v4-explorer-21x26.example.json": ckt-v4-native-corpus ckt-v4-ergonomic-fixture ckt-v4-ranked-explorer-seeds
    pwsh -NoLogo -NoProfile -File tools/run_ckt_v4_explorer.ps1 -Config "{{config}}"

ckt-v4-ergonomic-fixture:
    python tools/export_ckt_v4_ergonomic_fixture.py --output research/.cache/ckt-v4-ergonomics.json

ckt-v4-ergonomic-smoke: ckt-v4-ergonomic-fixture ckt-v4-all-scheme-fixture ckt-v4-native-corpus
    $paths = @('research/checkpoints/ckt-v4-ergonomic-smoke-base.json', 'research/checkpoints/ckt-v4-ergonomic-smoke-exact.json', 'research/checkpoints/ckt-v4-ergonomic-smoke.jsonl', 'research/checkpoints/ckt-v4-ergonomic-smoke-frontier.json', 'research/checkpoints/ckt-v4-ergonomic-smoke-reject.json'); $paths | Where-Object { Test-Path -LiteralPath $_ } | ForEach-Object { Remove-Item -LiteralPath $_ -Force }
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin anneal-native -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-schemes.json tools/ckt_v4_upstream_role_tables.json SNF4-M36-AE-07 --steps 1 --proposal head-pair-regroup --checkpoint research/checkpoints/ckt-v4-ergonomic-smoke-base.json --checkpoint-every 0 --verify-every 1 --duty-ms 0
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin anneal-native -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-schemes.json tools/ckt_v4_upstream_role_tables.json SNF4-M36-AE-07 --steps 1 --proposal head-pair-regroup --checkpoint research/checkpoints/ckt-v4-ergonomic-smoke-exact.json --checkpoint-every 0 --verify-every 1 --duty-ms 0 --ergonomic-fixture research/.cache/ckt-v4-ergonomics.json --max-rp 1 --max-w 1 --max-y 1 --min-mx-score 0 --frontier-log research/checkpoints/ckt-v4-ergonomic-smoke.jsonl --record leaders
    $base = Get-Content -Raw 'research/checkpoints/ckt-v4-ergonomic-smoke-base.json' | ConvertFrom-Json; $exact = Get-Content -Raw 'research/checkpoints/ckt-v4-ergonomic-smoke-exact.json' | ConvertFrom-Json; $fields = @('rngState','currentScore','bestScore','accepted','evaluated','currentLayout','bestLayout','proposalStats'); foreach ($field in $fields) { if (($base.$field | ConvertTo-Json -Depth 100 -Compress) -cne ($exact.$field | ConvertTo-Json -Depth 100 -Compress)) { throw "no-guard trajectory changed at $field" } }
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin merge-frontier -- research/checkpoints/ckt-v4-ergonomic-smoke.jsonl research/checkpoints/ckt-v4-ergonomic-smoke-frontier.json
    $frontier = Get-Content -Raw 'research/checkpoints/ckt-v4-ergonomic-smoke-frontier.json' | ConvertFrom-Json; if ($frontier.provenance.ergonomicSchema.loads -ne 'exact' -or $frontier.provenance.ergonomicSchema.movingHand -ne 'exact' -or $frontier.members.Count -lt 1) { throw 'exact ergonomic frontier schema missing' }
    $output = & cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin anneal-native -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-schemes.json tools/ckt_v4_upstream_role_tables.json SNF4-M36-AE-07 --steps 1 --checkpoint research/checkpoints/ckt-v4-ergonomic-smoke-reject.json --checkpoint-every 0 --verify-every 1 --duty-ms 0 --ergonomic-fixture research/.cache/ckt-v4-ergonomics.json --max-rp 0.000001 2>&1; if ($LASTEXITCODE -eq 0 -or ($output -join "`n") -notmatch 'right-pinky') { throw 'impossible exact ergonomic guard was not reported' }; $global:LASTEXITCODE = 0
