set shell := ["pwsh", "-NoLogo", "-NoProfile", "-Command"]

readme-representatives:
    node tools/update_readme_representatives.mjs

readme-representatives-check:
    node tools/update_readme_representatives.mjs --check

ckt-v4-fixture:
    node tools/export_ckt_v4_kernel_fixture.js --output tests/fixtures/ckt_v4_kernel_reference.json

ckt-v4-js-test:
    node --test tests/*.test.mjs

toned-2121-factorization-search steps="30000" restarts="4":
    node tools/search_toned_2121_factorizations.js --steps "{{steps}}" --restarts "{{restarts}}"
    node tools/optimize_toned_2121_physical.js --steps 5000 --restarts 3

toned-2121-ckt-v51:
    node tools/score_toned_2121_ckt_v51.js

toned-2121-aux-order:
    node tools/optimize_toned_2121_aux_order.js

toned-2121-constrained-search:
    node tools/search_toned_2121_constrained_ckt.js --sample 160 --resample 1200 --preselect 48 --finalists 5 --max-m 15 --max-d 2 --max-v 1

toned-2121-written-lowm steps="10000" restarts="8":
    node tools/search_toned_2121_written_lowm.js --steps "{{steps}}" --restarts "{{restarts}}"

pindu-nextgen-image-audit:
    node tools/audit_pindu_nextgen_image.js

pindu11-2121-comparison steps="30000" restarts="6":
    node tools/search_toned_2121_factorizations.js --steps "{{steps}}" --restarts "{{restarts}}" --output research/notes/2026-11-09-ckt-v51-toned-2121-pindu11-factorization-search.json
    node tools/optimize_toned_2121_physical.js --search research/notes/2026-11-09-ckt-v51-toned-2121-pindu11-factorization-search.json --output research/config/ckt-v51-toned-2121-pindu11-layouts.json --steps 10000 --restarts 4
    node tools/score_toned_2121_ckt_v51.js --layouts research/config/ckt-v51-toned-2121-pindu11-layouts.json --policy 12/213/24 --shape QAOPL --output research/notes/2026-11-09-ckt-v51-toned-2121-pindu11-ckt-fixed-policy.json

pindu11-2121-screen runs="8":
    node tools/screen_toned_2121_pindu11.js --runs "{{runs}}"
    node tools/score_toned_2121_ckt_v51.js --layouts research/config/ckt-v51-toned-2121-pindu11-screen-layouts.json --policy 12/213/24 --shape QAOPL --output research/notes/2026-11-09-ckt-v51-toned-2121-pindu11-screen-ckt-fixed-policy.json

pindu11-2121-lowmd retain="256" sample_retain="512":
    node tools/search_toned_2121_pindu11_lowmd.js --retain "{{retain}}" --sample-retain "{{sample_retain}}"
    node tools/score_toned_2121_ckt_v51.js --layouts research/config/ckt-v51-toned-2121-pindu11-lowmd-layouts.json --policy 12/213/24 --shape QAOPL --sample 160 --output research/notes/2026-11-09-ckt-v51-toned-2121-pindu11-lowmd-sample-ckt.json

pindu11-2121-dmin:
    node tools/search_toned_2121_pindu11_lowmd.js --retain 256 --sample-retain 512
    node tools/score_toned_2121_ckt_v51.js --layouts research/config/ckt-v51-toned-2121-pindu11-lowmd-layouts.json --max-d 11 --policy 12/213/24 --shape QAOPL --sample 160 --output research/notes/2026-11-09-ckt-v51-toned-2121-pindu11-dmin-sample.json
    node tools/score_toned_2121_ckt_v51.js --layouts research/config/ckt-v51-toned-2121-pindu11-lowmd-layouts.json --rank-from research/notes/2026-11-09-ckt-v51-toned-2121-pindu11-dmin-sample.json --top 64 --policy 12/213/24 --shape QAOPL --output research/notes/2026-11-09-ckt-v51-toned-2121-pindu11-dmin-full.json
    node tools/optimize_toned_2121_pindu11_lowmd_columns.js --layouts research/config/ckt-v51-toned-2121-pindu11-lowmd-layouts.json --reports research/notes/2026-11-09-ckt-v51-toned-2121-pindu11-dmin-full.json --bases 8 --sample 120 --retain 4 --output-layouts research/config/ckt-v51-toned-2121-pindu11-dmin-column-finalists.json --output-report research/notes/2026-11-09-ckt-v51-toned-2121-pindu11-dmin-column-screen.json
    node tools/score_toned_2121_ckt_v51.js --layouts research/config/ckt-v51-toned-2121-pindu11-dmin-column-finalists.json --policy 12/213/24 --shape QAOPL --output research/notes/2026-11-09-ckt-v51-toned-2121-pindu11-dmin-column-full.json

pindu11-2121-lowmd-columns bases="8" sample="120":
    node tools/optimize_toned_2121_pindu11_lowmd_columns.js --bases "{{bases}}" --sample "{{sample}}"
    node tools/score_toned_2121_ckt_v51.js --layouts research/config/ckt-v51-toned-2121-pindu11-lowmd-column-finalists.json --policy 12/213/24 --shape QAOPL --output research/notes/2026-11-09-ckt-v51-toned-2121-pindu11-lowmd-column-full.json

pindu11-2121-lowmd-coordinate starts="32" sample="160":
    node tools/optimize_toned_2121_pindu11_lowmd_first.js --starts "{{starts}}" --sample "{{sample}}"
    node tools/score_toned_2121_ckt_v51.js --layouts research/config/ckt-v51-toned-2121-pindu11-lowmd-coordinate-layouts.json --policy 12/213/24 --shape QAOPL --output research/notes/2026-11-09-ckt-v51-toned-2121-pindu11-lowmd-coordinate-full.json

pindu11-2121-dmin-rhyme-partitions bases="8" retain="256" uniform="256" orders="2":
    node tools/search_toned_2121_pindu11_rhyme_partitions.js --bases "{{bases}}" --retain "{{retain}}" --uniform "{{uniform}}" --orders "{{orders}}"
    node tools/score_toned_2121_ckt_v51.js --layouts research/config/ckt-v51-toned-2121-pindu11-dmin-rhyme-partition-layouts.json --policy 12/213/24 --shape QAOPL --sample 80 --output research/notes/2026-11-09-ckt-v51-toned-2121-pindu11-dmin-rhyme-partition-sample.json

pindu16-2121-dmin-rhyme-search bases="8" starts="256" retain="64" orders="2":
    node tools/search_toned_2121_pindu16_rhyme.js --bases "{{bases}}" --starts "{{starts}}" --retain "{{retain}}" --orders "{{orders}}"

pindu11-2121-uneven786 starts="576" retain="576":
    node tools/search_toned_2121_pindu11_uneven_regions.js --starts "{{starts}}" --retain "{{retain}}" --output-layouts research/.cache/uneven786-pindu11-layouts.json --output-report research/.cache/uneven786-pindu11-search.json
    node tools/score_toned_2121_ckt_v51.js --layouts research/.cache/uneven786-pindu11-layouts.json --policy 12/213/24 --shape AVUIO --sample 1800 --output research/.cache/uneven786-pindu11-sample1800.json
    node tools/score_toned_2121_ckt_v51.js --layouts research/.cache/uneven786-pindu11-layouts.json --rank-from research/.cache/uneven786-pindu11-sample1800.json --top 32 --policy 12/213/24 --shape AVUIO --output research/notes/2026-11-10-ckt-v51-toned-2121-pindu11-uneven786-full.json

pindu11-2121-uneven786-alt starts="576" retain="576":
    node tools/search_toned_2121_pindu11_uneven_regions.js --tone-profile upper35-home12-lower4 --starts "{{starts}}" --retain "{{retain}}" --output-layouts research/.cache/uneven786-alt35-12-4-layouts.json --output-report research/.cache/uneven786-alt35-12-4-search.json
    node tools/score_toned_2121_ckt_v51.js --layouts research/.cache/uneven786-alt35-12-4-layouts.json --policy 12/213/24 --shape AVUIO --sample 1800 --output research/.cache/uneven786-alt35-12-4-sample1800.json
    node tools/score_toned_2121_ckt_v51.js --layouts research/.cache/uneven786-alt35-12-4-layouts.json --rank-from research/.cache/uneven786-alt35-12-4-sample1800.json --top 32 --policy 12/213/24 --shape AVUIO --output research/.cache/uneven786-alt35-12-4-full32.json

pindu11-2121-four-regions starts_per_partition="4" region_swaps="0" seed="41143016":
    node tools/search_toned_2121_pindu11_four_regions.js --starts-per-partition "{{starts_per_partition}}" --region-swaps "{{region_swaps}}" --seed "{{seed}}" --retain 1024 --output-layouts research/.cache/fourregion-pindu11-layouts.json --output-report research/.cache/fourregion-pindu11-search.json
    node tools/score_toned_2121_ckt_v51.js --layouts research/.cache/fourregion-pindu11-layouts.json --policy 12/213/24 --shape AVUIO --sample 1800 --output research/.cache/fourregion-pindu11-sample1800.json
    node tools/score_toned_2121_ckt_v51.js --layouts research/.cache/fourregion-pindu11-layouts.json --rank-from research/.cache/fourregion-pindu11-sample1800.json --top 32 --policy 12/213/24 --shape AVUIO --output research/.cache/fourregion-pindu11-full32.json

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

ckt-v4-cuda-benchmark: ckt-v4-native-corpus ckt-v4-all-scheme-fixture
    cargo run --release --features cuda --manifest-path research/ckt-v4-core/Cargo.toml --bin bench-cuda-full -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-all-schemes.json tools/ckt_v4_upstream_role_tables.json BCW-cdf451dbb5af BCW-2992c2dd117a BCW-25fd28a07cb2

ckt-v4-cuda-benchmark-21x26: ckt-v4-native-corpus ckt-v4-all-scheme-fixture
    cargo run --release --features cuda --manifest-path research/ckt-v4-core/Cargo.toml --bin bench-cuda-full -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-all-schemes.json tools/ckt_v4_upstream_role_tables.json SY26-V3-R2-M44-D9-HOME-SPEED SY26-V3-R2-M43-D9-HOME-SPEED SY26-V3-R2-M44-D9-ULTIMATE-384

ckt-v4-native-incremental-smoke:
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin verify-native -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-schemes.json research/.cache/ckt-v4-real-reference.bin tools/ckt_v4_upstream_role_tables.json --incremental-smoke

ckt-v4-native-score:
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin score-native -- research/.cache/ckt-v4-native-corpus.bin research/.cache/ckt-v4-schemes.json tools/ckt_v4_upstream_role_tables.json

ckt-v51-toned-rust-trial-prepare:
    node tools/export_ckt_v4_native_corpus.js --ids S005 --output research/.cache/ckt-v51-toned-native-corpus.bin --schemes research/.cache/ckt-v51-toned-native-schemes.json
    node tools/export_toned_2121_rust_trial.js --output research/.cache/ckt-v51-toned-2121-rust-trial.json

ckt-v51-toned-rust-trial max_evaluations="120" beam="0" duty_ms="5": ckt-v51-toned-rust-trial-prepare
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin trial-toned-pareto -- research/.cache/ckt-v51-toned-native-corpus.bin research/.cache/ckt-v51-toned-2121-rust-trial.json tools/ckt_v4_upstream_role_tables.json --max-evaluations "{{max_evaluations}}" --beam "{{beam}}" --duty-ms "{{duty_ms}}" --checkpoint research/.cache/ckt-v51-toned-rust-trial-checkpoint.json --output research/.cache/ckt-v51-toned-rust-trial-result.json

ckt-v51-toned-rust-trial-resume max_evaluations="120" beam="0" duty_ms="5":
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin trial-toned-pareto -- research/.cache/ckt-v51-toned-native-corpus.bin research/.cache/ckt-v51-toned-2121-rust-trial.json tools/ckt_v4_upstream_role_tables.json --max-evaluations "{{max_evaluations}}" --beam "{{beam}}" --duty-ms "{{duty_ms}}" --resume --checkpoint research/.cache/ckt-v51-toned-rust-trial-checkpoint.json --output research/.cache/ckt-v51-toned-rust-trial-result.json

ckt-v51-toned-avuio786-rust-prepare:
    node tools/export_ckt_v4_native_corpus.js --ids S005 --output research/.cache/ckt-v51-toned-native-corpus.bin --schemes research/.cache/ckt-v51-toned-native-schemes.json
    node tools/export_toned_2121_rust_trial.js --layouts research/config/ckt-v51-toned-2121-pindu11-uneven786-finalists.json --scores research/notes/2026-11-10-ckt-v51-toned-2121-pindu11-uneven786-full.json --id UNEVEN786-pindu11-D8-267 --shape AVUIO --output research/.cache/ckt-v51-toned-2121-avuio786-rust.json

ckt-v51-toned-avuio786-rust-trial proposal_space="joint" max_evaluations="120" beam="0" duty_ms="5": ckt-v51-toned-avuio786-rust-prepare
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin trial-toned-pareto -- research/.cache/ckt-v51-toned-native-corpus.bin research/.cache/ckt-v51-toned-2121-avuio786-rust.json tools/ckt_v4_upstream_role_tables.json --proposal-space "{{proposal_space}}" --max-evaluations "{{max_evaluations}}" --beam "{{beam}}" --duty-ms "{{duty_ms}}" --checkpoint research/.cache/ckt-v51-toned-avuio786-rust-{{proposal_space}}-checkpoint.json --output research/.cache/ckt-v51-toned-avuio786-rust-{{proposal_space}}-result.json

ckt-v51-toned-avuio786-rust-resume proposal_space="joint" max_evaluations="120" beam="0" duty_ms="5":
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin trial-toned-pareto -- research/.cache/ckt-v51-toned-native-corpus.bin research/.cache/ckt-v51-toned-2121-avuio786-rust.json tools/ckt_v4_upstream_role_tables.json --proposal-space "{{proposal_space}}" --max-evaluations "{{max_evaluations}}" --beam "{{beam}}" --duty-ms "{{duty_ms}}" --resume --checkpoint research/.cache/ckt-v51-toned-avuio786-rust-{{proposal_space}}-checkpoint.json --output research/.cache/ckt-v51-toned-avuio786-rust-{{proposal_space}}-result.json

ckt-v51-toned-mars10-search:
    node tools/search_toned_2121_mars10_uneven_regions.js --first-mode mars-zh-e --rhyme-mode mars10 --starts 512 --retain 64 --seed 1410786 --output-layouts research/.cache/ckt-v51-toned-2121-marsfirst-zh-mars10-layouts.json --output-report research/.cache/ckt-v51-toned-2121-marsfirst-zh-mars10-search.json
    node tools/score_toned_2121_ckt_v51.js --layouts research/.cache/ckt-v51-toned-2121-marsfirst-zh-mars10-layouts.json --policy 12/213/24 --shape AVUIO --sample 1800 --output research/.cache/ckt-v51-toned-2121-marsfirst-zh-mars10-sample1800.json
    node tools/score_toned_2121_ckt_v51.js --layouts research/.cache/ckt-v51-toned-2121-marsfirst-zh-mars10-layouts.json --rank-from research/.cache/ckt-v51-toned-2121-marsfirst-zh-mars10-sample1800.json --top 3 --policy 12/213/24 --shape AVUIO --output research/notes/2026-11-10-ckt-v51-toned-2121-marsfirst-zh-e-mars10-full3.json
    node tools/select_toned_2121_scored_layouts.js --layouts research/.cache/ckt-v51-toned-2121-marsfirst-zh-mars10-layouts.json --scores research/notes/2026-11-10-ckt-v51-toned-2121-marsfirst-zh-e-mars10-full3.json --output research/config/ckt-v51-toned-2121-marsfirst-zh-e-mars10-uneven786-finalist.json --top 1

ckt-v51-toned-mars10-rust-prepare:
    node tools/export_ckt_v4_native_corpus.js --ids S005 --output research/.cache/ckt-v51-toned-native-corpus.bin --schemes research/.cache/ckt-v51-toned-native-schemes.json
    node tools/export_toned_2121_rust_trial.js --layouts research/config/ckt-v51-toned-2121-marsfirst-zh-e-mars10-uneven786-finalist.json --scores research/notes/2026-11-10-ckt-v51-toned-2121-marsfirst-zh-e-mars10-full3.json --id UNEVEN786-marsfirst-zh-e-mars10-D1-014 --shape AVUIO --output research/.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json

ckt-v51-toned-mars10-rust-trial max_evaluations="30" beam="0" duty_ms="5" proposal_space="joint": ckt-v51-toned-mars10-rust-prepare
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin trial-toned-pareto -- research/.cache/ckt-v51-toned-native-corpus.bin research/.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json tools/ckt_v4_upstream_role_tables.json --proposal-space "{{proposal_space}}" --max-evaluations "{{max_evaluations}}" --beam "{{beam}}" --duty-ms "{{duty_ms}}" --checkpoint research/.cache/ckt-v51-toned-marsfirst-zh-e-mars10-v3-{{proposal_space}}-checkpoint.json --output research/.cache/ckt-v51-toned-marsfirst-zh-e-mars10-v3-{{proposal_space}}-result.json

ckt-v51-toned-mars10-rust-resume max_evaluations="30" beam="0" duty_ms="5" proposal_space="joint":
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin trial-toned-pareto -- research/.cache/ckt-v51-toned-native-corpus.bin research/.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json tools/ckt_v4_upstream_role_tables.json --proposal-space "{{proposal_space}}" --max-evaluations "{{max_evaluations}}" --beam "{{beam}}" --duty-ms "{{duty_ms}}" --resume --checkpoint research/.cache/ckt-v51-toned-marsfirst-zh-e-mars10-v3-{{proposal_space}}-checkpoint.json --output research/.cache/ckt-v51-toned-marsfirst-zh-e-mars10-v3-{{proposal_space}}-result.json

ckt-v51-toned-mars10-rust-twohop max_evaluations="700" beam="2" duty_ms="5" checkpoint_every="25":
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin trial-toned-pareto -- research/.cache/ckt-v51-toned-native-corpus.bin research/.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json tools/ckt_v4_upstream_role_tables.json --proposal-space joint --beam "{{beam}}" --max-evaluations "{{max_evaluations}}" --duty-ms "{{duty_ms}}" --checkpoint-every "{{checkpoint_every}}" --resume --checkpoint research/.cache/ckt-v51-toned-marsfirst-zh-e-mars10-v3-twohop-checkpoint.json --output research/.cache/ckt-v51-toned-marsfirst-zh-e-mars10-v3-twohop-result.json

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
