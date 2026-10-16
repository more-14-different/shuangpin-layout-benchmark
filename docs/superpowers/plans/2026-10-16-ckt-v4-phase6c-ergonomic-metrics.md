# CKT v4 Phase 6C Ergonomic Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproduce frozen historical load and moving-hand outputs for regular layouts, then expose them as explicit guards or Pareto dimensions without altering CKT v4.

**Architecture:** Export compact, hash-bound metric fixtures from the ignored R11 replay instead of copying its large dependencies. Rust evaluates token-load summaries and moving-hand corpora from regular scheme states; formal integration is gated on exact fixture agreement and keeps source/license provenance explicit.

**Tech Stack:** Node.js/Python fixture adapters, Rust 2024, serde/serde_json, existing ignored replay cache.

**Spec:** `research/notes/2026-10-16-ckt-v4-phase6-regular-frontier-design.md`

## Global Constraints

- Phase 6A capability APIs and Phase 6B frontier schema are prerequisites.
- CKT v4 remains the sole annealing energy; ergonomic values are opt-in guards or output dimensions.
- Historical MX units are relative moving-hand model units, not milliseconds or measured fatigue.
- No GPL source text is copied into the MIT Rust crate; provenance and license boundaries are documented.
- A metric stays `provisional` and cannot dominate candidates until every frozen verification fixture matches.
- The full 34-key geometry includes `[]\\'` and native punctuation; unsupported keys fail explicitly.

## Review Focus

- A corpus token with a fixed legacy key must bypass scheme pinyin mapping exactly (Task 3 test).
- Extension keys `[]\\'` must use their declared right-pinky geometry rather than a 26-key projection (Task 3 test).
- Empty/unknown-key moving-hand input must fail instead of yielding NaN (Task 3 test).
- A load fixture whose token vocabulary/order differs from the 67-state layout must fail provenance validation (Task 2 test).
- Provisional MX/load fields must be excluded from Pareto dominance and guards until verification status is `exact` (Task 4 test).

---

### Task 1: Freeze compact ergonomic fixture provenance

**Files:**
- Create: `tools/export_ckt_v4_ergonomic_fixture.py`
- Create: `tests/ckt-v4-ergonomic-export.test.mjs`
- Modify: `.gitignore`
- Modify: `justfile`

**Interfaces:**
- Consumes: user-supplied/restored R11 replay containing `model_meta.json`, `r4_token_loads.json`, `R9_corpora.json`, frozen MX results, and source HTML.
- Produces: ignored `research/.cache/ckt-v4-ergonomics.json` with SHA-256 for every source, 20×67 token masses, keyboard geometry, tokenized daily/default corpora, fixed-key tokens, character counts, and frozen expected summaries.

- [ ] **Step 1: Write failing exporter contract tests**

Assert deterministic key order, exactly 20 load tracks and 67 token columns, both daily/default corpora with native-punctuation and hanzi-only contracts, source hashes, and expected records for known regular seeds.

- [ ] **Step 2: Run the focused test and observe RED**

Run: `node --test tests/ckt-v4-ergonomic-export.test.mjs`
Expected: FAIL because the exporter is absent.

- [ ] **Step 3: Implement the fixture adapter**

Read replay files without extracting/copying the package into tracked source. Emit abstract data and expected numbers, not GPL implementation source. Reject missing fields and mismatched scheme/source hashes.

- [ ] **Step 4: Generate twice and compare bytes**

Run: `just ckt-v4-ergonomic-fixture; Copy-Item research/.cache/ckt-v4-ergonomics.json research/.cache/ckt-v4-ergonomics.first.json; just ckt-v4-ergonomic-fixture; Compare-Object (Get-Content -Raw research/.cache/ckt-v4-ergonomics.first.json) (Get-Content -Raw research/.cache/ckt-v4-ergonomics.json)`
Expected: no comparison output.

- [ ] **Step 5: Commit**

Run: `git add tools/export_ckt_v4_ergonomic_fixture.py tests/ckt-v4-ergonomic-export.test.mjs .gitignore justfile; git commit -m "feat(ckt-v4): export ergonomic verification fixture"`

### Task 2: Historical token-load diagnostics

**Files:**
- Create: `research/ckt-v4-core/src/ergonomics.rs`
- Create: `research/ckt-v4-core/tests/ergonomic_loads.rs`
- Modify: `research/ckt-v4-core/src/lib.rs`

**Interfaces:**
- Produces: `ErgonomicFixture::open`, `TokenLoadModel::validate`, and `TokenLoadModel::diagnose(layout: &RegularLayout) -> LoadDiagnostics`.
- Produces: `rp_s2`, `rp_max`, `home_s2`, `home_c4`, `home_wx`, `home_floor`, `w_max`, and `y_max` with the frozen 20-track definitions.

- [ ] **Step 1: Write failing exact-load tests**

Compare at least S005-NF and SNF4 regular states against frozen R11 values, and reject a fixture with permuted token/key order.

- [ ] **Step 2: Run the focused test and observe RED**

Run: `cargo test --manifest-path research/ckt-v4-core/Cargo.toml --test ergonomic_loads`
Expected: compile failure because `ergonomics` is absent.

- [ ] **Step 3: Implement matrix diagnostics**

Map the canonical 27+35+5 state to the frozen token columns and compute the documented sums directly; do not import old composite search objectives.

- [ ] **Step 4: Run exact tests and Clippy**

Run: `cargo test --manifest-path research/ckt-v4-core/Cargo.toml --test ergonomic_loads; cargo clippy --manifest-path research/ckt-v4-core/Cargo.toml --all-targets -- -D warnings`
Expected: exact fixture assertions pass and Clippy is clean.

- [ ] **Step 5: Commit**

Run: `git add research/ckt-v4-core/src/ergonomics.rs research/ckt-v4-core/tests/ergonomic_loads.rs research/ckt-v4-core/src/lib.rs; git commit -m "feat(ckt-v4): reproduce historical load diagnostics"`

### Task 3: Moving-hand MX34 evaluator

**Files:**
- Create: `research/ckt-v4-core/src/moving_hand.rs`
- Create: `research/ckt-v4-core/tests/moving_hand.rs`
- Modify: `research/ckt-v4-core/src/lib.rs`

**Interfaces:**
- Consumes: Task 1 abstract geometry/corpus fixture and `SchemeState::code_at` from Phase 6A.
- Produces: `MovingHandModel::validate` and `evaluate(scheme: &SchemeState, corpus: &MovingHandCorpus) -> MovingHandSummary`.
- Produces: score, relative time, row/finger loads, hand balance, same-hand/same-finger rates, and explicit `unit="relative hand-model cost; not ms"`.

- [ ] **Step 1: Write failing numerical-contract tests**

Test a hand-computable two-key path, fixed-key token precedence, all four extension-key coordinates, empty input, unknown keys, and frozen S005-NF/SNF4 daily/default summaries within `1e-10`.

- [ ] **Step 2: Run the focused test and observe RED**

Run: `cargo test --manifest-path research/ckt-v4-core/Cargo.toml --test moving_hand`
Expected: compile failure because the moving-hand API is absent.

- [ ] **Step 3: Implement from the documented numerical contract**

Use the fixture's geometry and constants; preserve the initial previous-column convention and fixed legacy tokens. Do not copy external implementation text or label relative time as milliseconds.

- [ ] **Step 4: Run exact tests**

Run: `cargo test --manifest-path research/ckt-v4-core/Cargo.toml --test moving_hand`
Expected: all hand cases and frozen records pass within the declared tolerance.

- [ ] **Step 5: Commit**

Run: `git add research/ckt-v4-core/src/moving_hand.rs research/ckt-v4-core/tests/moving_hand.rs research/ckt-v4-core/src/lib.rs; git commit -m "feat(ckt-v4): add verified MX34 evaluator"`

### Task 4: Guard/frontier integration with verification gate

**Files:**
- Create: `research/ckt-v4-core/tests/ergonomic_integration.rs`
- Modify: `research/ckt-v4-core/src/frontier.rs`
- Modify: `research/ckt-v4-core/src/bin/anneal-native.rs`
- Modify: `research/ckt-v4-core/src/bin/merge-frontier.rs`
- Modify: `justfile`

**Interfaces:**
- Consumes: exact Task 2–3 diagnostics and Phase 6B frontier points.
- Produces: explicit optional load/MX guard flags and metric-schema declarations; `provisional` metrics are serialized but never used for rejection or domination.

- [ ] **Step 1: Write failing integration tests**

Assert no flags preserve the exact CKT-only trajectory, exact load guards reject only after structural validation, MX direction is maximize while CKT/M/D/V/load peaks minimize, and provisional values never change frontier membership.

- [ ] **Step 2: Run the focused test and observe RED**

Run: `cargo test --manifest-path research/ckt-v4-core/Cargo.toml --test ergonomic_integration`
Expected: FAIL because the guards/schema are absent.

- [ ] **Step 3: Add explicit schemas and flags**

Bind every enabled metric and threshold into checkpoints/log provenance. Keep raw CKT acceptance unchanged; reject guard violations before row scoring when their diagnostics are layout-only.

- [ ] **Step 4: Run deterministic no-guard and guarded smoke tests**

Run: `just ckt-v4-ergonomic-smoke; cargo test --manifest-path research/ckt-v4-core/Cargo.toml --test ergonomic_integration`
Expected: the no-guard baseline is byte-identical to its frozen checkpoint result and guarded cases report the responsible metric.

- [ ] **Step 5: Commit**

Run: `git add research/ckt-v4-core/tests/ergonomic_integration.rs research/ckt-v4-core/src/frontier.rs research/ckt-v4-core/src/bin/anneal-native.rs research/ckt-v4-core/src/bin/merge-frontier.rs justfile; git commit -m "feat(ckt-v4): gate ergonomic search metrics"`

### Task 5: Provenance note and complete Phase 6 verification

**Files:**
- Create: `research/notes/2026-10-16-ckt-v4-phase6-ergonomic-provenance.md`
- Modify: `research/README.md`
- Modify: `docs/CKT_v4_RUST_KERNEL.md`

**Interfaces:**
- Consumes: final fixtures, numerical tolerances, and CLI flags.
- Produces: source/license/unit/coverage documentation and exact/provisional status table.

- [ ] **Step 1: Write the provenance note**

Record every source hash, field definition, direction, tolerance, excluded behavior, license boundary, and why MX is not milliseconds. Mark any unmatched track provisional.

- [ ] **Step 2: Run the full verification matrix**

Run: `cargo fmt --manifest-path research/ckt-v4-core/Cargo.toml --check; cargo clippy --manifest-path research/ckt-v4-core/Cargo.toml --all-targets -- -D warnings; cargo test --manifest-path research/ckt-v4-core/Cargo.toml; just ckt-v4-js-test; just ckt-v4-native-incremental-smoke; just ckt-v4-capability-audit; just ckt-v4-frontier-smoke; just ckt-v4-ergonomic-smoke; git diff --check`
Expected: every command exits 0 and no metric remains formal without exact fixture coverage.

- [ ] **Step 3: Commit**

Run: `git add research/notes/2026-10-16-ckt-v4-phase6-ergonomic-provenance.md research/README.md docs/CKT_v4_RUST_KERNEL.md; git commit -m "docs(ckt-v4): record ergonomic metric provenance"`
