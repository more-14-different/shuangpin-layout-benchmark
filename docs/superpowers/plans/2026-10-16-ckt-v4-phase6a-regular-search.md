# CKT v4 Phase 6A Regular Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit every HTML scheme for regular-annealing capability and add capacity-preserving compound proposals that make strict-unique regular layouts searchable.

**Architecture:** A shared JS fixture builder exports either selected or all schemes. A typed Rust capability layer separates full-code forward support from 27+35 regular-state support; a library search module owns deterministic proposal generation so the binary only owns scoring and checkpoints.

**Tech Stack:** Node.js CommonJS, Rust 2024, serde/serde_json, existing `just` workflows.

**Spec:** `research/notes/2026-10-16-ckt-v4-phase6-regular-frontier-design.md`

## Global Constraints

- CKT v4 is the only annealing energy; M/D/V and later metrics remain explicit guards or outputs.
- The physical domain is exactly `ABCDEFGHIJKLMNOPQRSTUVWXYZ[]\\;',./`.
- Only no-fly 21×21 and 23×23 may collide within Common399; every other size must remain unique.
- Capability is established by behavior, never by scheme ID or a blanket size exclusion.
- `N095` and `H37` remain forward-scoreable but are not given special topology adapters in phase 6.
- Default execution is single-threaded and retains `--duty-ms`; no GPU backend is introduced.
- Cached fixtures and checkpoints remain git-ignored.

## Review Focus

- A forward-valid scheme with a context-split final must be reported as unsupported regular topology, not crash or become a free per-syllable state (Task 2 test).
- A Common399-exact scheme whose extension-22 codes differ must stay annealable while reporting `extensionRoundTrip=false` (Task 2 test).
- A compound proposal that preserves key count but breaks strict Common399 uniqueness must be rejected before CKT row generation (Task 4 test).
- A 23×23 regular synthetic scheme must retain the allowed-collision policy even though `N095` itself is unsupported (Task 2 test).
- A checkpoint produced before the proposal schema change must fail with a version mismatch, while a new checkpoint must resume bit-for-bit (Task 5 test).

---

### Task 1: Shared all-scheme fixture builder

**Files:**
- Create: `tools/ckt_v4_scheme_fixture.js`
- Create: `tools/export_ckt_v4_scheme_fixture.js`
- Create: `tests/ckt-v4-scheme-fixture.test.mjs`
- Modify: `tools/export_ckt_v4_native_corpus.js`
- Modify: `justfile`

**Interfaces:**
- Produces: `buildSchemeFixture(data, entries, htmlHash) -> object` and `selectSchemeEntries(data, ids) -> entry[]`; CLI accepts `--ids all` and writes `ckt-v4-scheme-state-2` JSON.
- Produces: `just ckt-v4-all-scheme-fixture` at `research/.cache/ckt-v4-all-schemes.json`.

- [ ] **Step 1: Write the failing JS tests**

Assert that `selectSchemeEntries(payload, ['all'])` returns every entry in HTML order, explicit IDs retain caller order, unknown IDs throw, and the native-corpus exporter and standalone exporter serialize identical topology/source fields for the same seven IDs.

- [ ] **Step 2: Run the focused tests and observe RED**

Run: `node --test tests/ckt-v4-scheme-fixture.test.mjs`
Expected: FAIL because `tools/ckt_v4_scheme_fixture.js` does not exist.

- [ ] **Step 3: Implement the shared builder and thin CLI**

Move the alphabet, head/final vocabulary, `splitPinyin`, selection, and scheme-fixture construction out of the native-corpus CLI. Preserve the current fixture fields and add only version-2 provenance needed by Task 2; do not duplicate HTML parsing or corpus construction.

- [ ] **Step 4: Run focused and full JS tests**

Run: `node --test tests/ckt-v4-scheme-fixture.test.mjs tests/ckt-v4-model.test.mjs`
Expected: PASS with zero failures.

- [ ] **Step 5: Generate the ignored all-scheme fixture and inspect it**

Run: `just ckt-v4-all-scheme-fixture`
Expected: output JSON contains the same number of schemes as the HTML payload and records the HTML SHA-256.

- [ ] **Step 6: Commit**

Run: `git add tools/ckt_v4_scheme_fixture.js tools/export_ckt_v4_scheme_fixture.js tools/export_ckt_v4_native_corpus.js tests/ckt-v4-scheme-fixture.test.mjs justfile; git commit -m "feat(ckt-v4): export all scheme states"`

### Task 2: Typed regular-capability audit

**Files:**
- Create: `research/ckt-v4-core/src/capability.rs`
- Create: `research/ckt-v4-core/src/bin/audit-capabilities.rs`
- Create: `research/ckt-v4-core/tests/capability.rs`
- Modify: `research/ckt-v4-core/src/native.rs`
- Modify: `research/ckt-v4-core/src/lib.rs`

**Interfaces:**
- Consumes: `SchemeFixture`, `SchemeInput`, `RegularLayout`, `SchemeState`, `KeyAlphabet`.
- Produces: `audit_scheme(fixture: &SchemeFixture, input: &SchemeInput, alphabet: &KeyAlphabet) -> SchemeCapability`.
- Produces: `SchemeState::code_at(index: usize) -> Option<[u8; 2]>` for read-only round-trip and later MX evaluation.
- Produces: serialized `SchemeCapability { id, capacity, forward_score, regular_anneal, common_round_trip, extension_round_trip, contract, common399_policy, reason_code, detail }`.
- Produces: stable `CapabilityReason` values including `supported`, `forward_invalid`, `common_head_split`, `common_final_split`, `regular_incomplete`, `regular_invalid`, and `common_round_trip_mismatch`.

- [ ] **Step 1: Write failing Rust capability tests**

Construct small fixtures asserting: a regular layout is supported; a context-split final returns `common_final_split`; an invalid physical key returns `forward_invalid`; an extension-only mismatch is supported with `extension_round_trip=false`; and a regular 23×23 fixture reports `allow_collisions`.

- [ ] **Step 2: Run the focused test and observe RED**

Run: `cargo test --manifest-path research/ckt-v4-core/Cargo.toml --test capability`
Expected: compile failure because the capability API is absent.

- [ ] **Step 3: Implement typed compilation and audit**

Add a typed internal regular-compilation error rather than parsing existing error strings. Keep the existing string-returning public calls as compatibility wrappers, accept the version-2 fixture while retaining version-1 compatibility, expose `SchemeState::code_at`, compare Common399 separately from the extension 22, and make the CLI emit deterministic JSON in fixture order.

- [ ] **Step 4: Run capability and library tests**

Run: `cargo test --manifest-path research/ckt-v4-core/Cargo.toml --test capability; cargo test --manifest-path research/ckt-v4-core/Cargo.toml --lib`
Expected: PASS; the 21×21/23×23 exception test remains green.

- [ ] **Step 5: Commit**

Run: `git add research/ckt-v4-core/src/capability.rs research/ckt-v4-core/src/bin/audit-capabilities.rs research/ckt-v4-core/tests/capability.rs research/ckt-v4-core/src/native.rs research/ckt-v4-core/src/lib.rs; git commit -m "feat(ckt-v4): audit regular topology capability"`

### Task 3: Real all-scheme capability report

**Files:**
- Create: `research/notes/2026-10-16-ckt-v4-phase6-capability-audit.md`
- Modify: `justfile`
- Modify: `research/README.md`

**Interfaces:**
- Consumes: Task 1 fixture and Task 2 `audit-capabilities` binary.
- Produces: `just ckt-v4-capability-audit` and ignored `research/.cache/ckt-v4-capabilities.json`.

- [ ] **Step 1: Add a failing recipe-level assertion**

Add a PowerShell assertion after the audit command requiring every fixture scheme to have one record, `N095/H37` to have `forwardScore=true` and `regularAnneal=false`, and the three known regular seeds to be supported.

- [ ] **Step 2: Run the recipe and observe RED**

Run: `just ckt-v4-capability-audit`
Expected: FAIL because the recipe/report does not yet exist.

- [ ] **Step 3: Implement the recipe and research note**

Document the exact source hashes, reason-code counts, supported capacity matrix, the Common399/extension distinction, and the explicit special-topology exclusion. Do not commit the generated all-scheme JSON.

- [ ] **Step 4: Run the audit twice and compare bytes**

Run: `just ckt-v4-capability-audit; Copy-Item research/.cache/ckt-v4-capabilities.json research/.cache/ckt-v4-capabilities.first.json; just ckt-v4-capability-audit; Compare-Object (Get-Content -Raw research/.cache/ckt-v4-capabilities.first.json) (Get-Content -Raw research/.cache/ckt-v4-capabilities.json)`
Expected: no comparison output.

- [ ] **Step 5: Commit**

Run: `git add justfile research/README.md research/notes/2026-10-16-ckt-v4-phase6-capability-audit.md; git commit -m "docs(ckt-v4): record regular capability audit"`

### Task 4: Capacity-preserving compound proposal engine

**Files:**
- Create: `research/ckt-v4-core/src/search.rs`
- Create: `research/ckt-v4-core/tests/search_proposals.rs`
- Modify: `research/ckt-v4-core/src/native.rs`
- Modify: `research/ckt-v4-core/src/lib.rs`
- Modify: `research/ckt-v4-core/src/bin/anneal-native.rs`

**Interfaces:**
- Consumes: `RegularLayout`, fixed zero-initial atomic groups, typed structure and uniqueness validation from Task 2.
- Produces: public `ProposalKind` with the existing ten variants plus `HeadPairRegroup`, `HeadCycleRegroup`, `FinalPairRegroup`, `FinalCycleRegroup`.
- Produces: `SearchRng::new(seed: u64)`, `propose(layout: &RegularLayout, kind: ProposalKind, rng: &mut SearchRng) -> Result<RegularLayout, ProposalError>`, and `propose_valid(layout, context, rng) -> ProposalResult`.

- [ ] **Step 1: Write failing proposal tests**

For the frozen 21×26 seed, force each new proposal until a changed legal candidate is produced; assert unchanged capacity, five distinct auxiliary keys, intact zero-initial atomic groups, and 399 unique Common399 codes. Add a synthetic candidate that preserves capacity but collides and assert `UniquenessRejected` before any corpus API is invoked.

- [ ] **Step 2: Run the focused test and observe RED**

Run: `cargo test --manifest-path research/ckt-v4-core/Cargo.toml --test search_proposals`
Expected: compile failure because `search` and the four variants do not exist.

- [ ] **Step 3: Extract the deterministic proposal engine**

Move `SplitMix64`, `ProposalKind`, group discovery and mutation out of the binary. Implement pair regrouping as a simultaneous two-source reassignment and three-cycle regrouping across three distinct occupied keys; reject no-op/empty-source outcomes. Split validation into cheap structure checks followed by Common399 policy checks.

- [ ] **Step 4: Run focused tests and forced real-seed audits**

Run: `cargo test --manifest-path research/ckt-v4-core/Cargo.toml --test search_proposals; just ckt-v4-anneal-proposal "SNF4-M36-AE-07" "head-pair-regroup"; just ckt-v4-anneal-proposal "SNF4-M36-AE-07" "final-cycle-regroup"`
Expected: all tests pass and each forced proposal reaches exact CKT scoring without relaxing uniqueness.

- [ ] **Step 5: Commit**

Run: `git add research/ckt-v4-core/src/search.rs research/ckt-v4-core/tests/search_proposals.rs research/ckt-v4-core/src/native.rs research/ckt-v4-core/src/lib.rs research/ckt-v4-core/src/bin/anneal-native.rs; git commit -m "feat(ckt-v4): add compound regular proposals"`

### Task 5: Proposal-stage counters and deterministic checkpoint v9

**Files:**
- Create: `research/ckt-v4-core/tests/anneal_resume.rs`
- Modify: `research/ckt-v4-core/src/search.rs`
- Modify: `research/ckt-v4-core/src/bin/anneal-native.rs`
- Modify: `docs/CKT_v4_SEARCH_NEIGHBORHOOD.md`
- Modify: `research/notes/2026-10-16-ckt-v4-phase6-capability-audit.md`
- Modify: `justfile`

**Interfaces:**
- Consumes: Task 4 `ProposalKind` and `ProposalResult`.
- Produces: per-kind `ProposalStats { proposed, structural_rejected, uniqueness_rejected, guard_rejected, evaluated, accepted }` in checkpoint version `ckt-v4-native-anneal-9`.
- Produces: checkpoint/resume result equality for layout, RNG state, score, counters, and proposal policy.

- [ ] **Step 1: Write failing checkpoint tests**

Run a short deterministic chain continuously and as write/resume halves, then assert identical serialized final state and stats. Feed a version-8 fixture and assert an explicit version mismatch.

- [ ] **Step 2: Run the focused test and observe RED**

Run: `cargo test --manifest-path research/ckt-v4-core/Cargo.toml --test anneal_resume`
Expected: FAIL because checkpoint v9 stats are absent.

- [ ] **Step 3: Implement classified counters and v9 persistence**

Increment exactly one rejection stage per failed attempt and only increment `evaluated` after CKT scoring begins. Persist the fixed proposal order and reject resumes whose order/policy differs.

- [ ] **Step 4: Run resume, full Rust, JS and lint verification**

Run: `cargo test --manifest-path research/ckt-v4-core/Cargo.toml; cargo clippy --manifest-path research/ckt-v4-core/Cargo.toml --all-targets -- -D warnings; just ckt-v4-js-test; just ckt-v4-native-incremental-smoke`
Expected: all commands exit 0; Rust reports zero failed tests and JS reports zero failures.

- [ ] **Step 5: Commit**

Run: `git add research/ckt-v4-core/tests/anneal_resume.rs research/ckt-v4-core/src/search.rs research/ckt-v4-core/src/bin/anneal-native.rs docs/CKT_v4_SEARCH_NEIGHBORHOOD.md research/notes/2026-10-16-ckt-v4-phase6-capability-audit.md justfile; git commit -m "feat(ckt-v4): audit compound annealing paths"`
