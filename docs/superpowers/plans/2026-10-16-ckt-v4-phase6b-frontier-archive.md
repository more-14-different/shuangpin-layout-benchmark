# CKT v4 Phase 6B Frontier Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve exact CKT/M/D/V Pareto candidates with bounded memory, append-only recovery, and deterministic offline merging.

**Architecture:** Annealing appends compact accepted/leader states without retaining history in RAM. A pure Rust frontier module performs exact unrounded dominance and a separate CLI merges, verifies, and emits the final frontier.

**Tech Stack:** Rust 2024, serde/serde_json, newline-delimited JSON, existing CKT v4 core.

**Spec:** `research/notes/2026-10-16-ckt-v4-phase6-regular-frontier-design.md`

## Global Constraints

- Phase 6A and checkpoint v9 are prerequisites.
- CKT v4 remains the only annealing energy; frontier membership never changes Metropolis acceptance.
- Dominance uses full finite values, never displayed rounding.
- Online memory must not grow linearly with candidate count.
- Logs/checkpoints are git-ignored and recoverable; no GPU or implicit parallelism.

## Review Focus

- Equal metrics with different layouts must use a deterministic canonical-layout tie break (Task 1 test).
- NaN/infinite metrics must be rejected rather than poison dominance (Task 1 test).
- A truncated final JSONL record must be ignored with a warning while earlier records survive (Task 2 test).
- Replaying duplicate records after a crash must not duplicate frontier members (Task 2 test).
- Resume plus offline merge must produce the same ordered frontier as uninterrupted execution (Task 3 test).

---

### Task 1: Exact Pareto core

**Files:**
- Create: `research/ckt-v4-core/src/frontier.rs`
- Create: `research/ckt-v4-core/tests/frontier.rs`
- Modify: `research/ckt-v4-core/src/lib.rs`

**Interfaces:**
- Consumes: `RegularLayout`, `LayoutDiagnostics`.
- Produces: `FrontierMetrics { ckt_v4: f64, memory: usize, displaced_initials: usize, displaced_vowels: usize }`, `FrontierPoint`, and `ExactFrontier::{insert, members}`.
- Produces: canonical layout bytes ordered by capacity, head keys, final keys, tone, and ID only as final tie-break metadata.

- [ ] **Step 1: Write failing dominance tests**

Cover dominated rejection, multi-member trade-offs, removal of newly dominated points, exact-equality tie breaking, duplicate layout replacement, and non-finite rejection.

- [ ] **Step 2: Run the focused test and observe RED**

Run: `cargo test --manifest-path research/ckt-v4-core/Cargo.toml --test frontier`
Expected: compile failure because the frontier module is absent.

- [ ] **Step 3: Implement the minimal pure frontier module**

All four metrics minimize. Require at least one strict improvement for domination; sort output lexicographically by metrics then canonical layout bytes.

- [ ] **Step 4: Run focused tests and Clippy**

Run: `cargo test --manifest-path research/ckt-v4-core/Cargo.toml --test frontier; cargo clippy --manifest-path research/ckt-v4-core/Cargo.toml --all-targets -- -D warnings`
Expected: PASS and no warnings.

- [ ] **Step 5: Commit**

Run: `git add research/ckt-v4-core/src/frontier.rs research/ckt-v4-core/tests/frontier.rs research/ckt-v4-core/src/lib.rs; git commit -m "feat(ckt-v4): add exact frontier core"`

### Task 2: Append-only candidate log and recovery

**Files:**
- Create: `research/ckt-v4-core/src/frontier_log.rs`
- Create: `research/ckt-v4-core/tests/frontier_log.rs`
- Modify: `research/ckt-v4-core/src/lib.rs`

**Interfaces:**
- Consumes: Task 1 `FrontierPoint`.
- Produces: `FrontierLogWriter::open(path, provenance)`, `append(&FrontierPoint)`, and `read_frontier_log(path) -> LogRecovery`.
- Produces: versioned header binding corpus/scheme hashes, scheme ID, guards, proposal policy, and metric schema.

- [ ] **Step 1: Write failing log tests**

Assert round-trip order, provenance mismatch failure, exact duplicate suppression during recovery, and acceptance of one truncated tail with `truncated_tail=true`.

- [ ] **Step 2: Run the focused test and observe RED**

Run: `cargo test --manifest-path research/ckt-v4-core/Cargo.toml --test frontier_log`
Expected: compile failure because the log API is absent.

- [ ] **Step 3: Implement streaming JSONL I/O**

Flush complete newline-terminated records, retain no historical vector in the writer, and treat malformed non-tail records as corruption rather than recovery.

- [ ] **Step 4: Run focused tests**

Run: `cargo test --manifest-path research/ckt-v4-core/Cargo.toml --test frontier_log`
Expected: all tests pass.

- [ ] **Step 5: Commit**

Run: `git add research/ckt-v4-core/src/frontier_log.rs research/ckt-v4-core/tests/frontier_log.rs research/ckt-v4-core/src/lib.rs; git commit -m "feat(ckt-v4): stream frontier candidates"`

### Task 3: Annealer logging and deterministic merge CLI

**Files:**
- Create: `research/ckt-v4-core/src/bin/merge-frontier.rs`
- Create: `research/ckt-v4-core/tests/frontier_resume.rs`
- Modify: `research/ckt-v4-core/src/bin/anneal-native.rs`
- Modify: `justfile`

**Interfaces:**
- Consumes: Phase 6A checkpoint v9 and Tasks 1–2 APIs.
- Produces: `--frontier-log PATH`, `--record accepted|leaders` and `merge-frontier LOG OUTPUT`.
- Produces: deterministic JSON with provenance, input/recovered/deduplicated counts, and ordered exact members.

- [ ] **Step 1: Write failing end-to-end resume test**

Compare uninterrupted and split/resumed short runs, then merge both logs and assert byte-identical frontier JSON and bounded in-process leader count.

- [ ] **Step 2: Run the focused test and observe RED**

Run: `cargo test --manifest-path research/ckt-v4-core/Cargo.toml --test frontier_resume`
Expected: FAIL because the annealer flags and merge binary are absent.

- [ ] **Step 3: Integrate logging without changing acceptance**

Record only after a candidate has exact metrics; include rejected Metropolis candidates only when `--record leaders` says they enter the online diagnostic leaders. Never load the old log into the annealer on resume.

- [ ] **Step 4: Implement and verify the merge CLI**

Run: `cargo test --manifest-path research/ckt-v4-core/Cargo.toml --test frontier_resume; just ckt-v4-frontier-smoke`
Expected: byte-identical continuous/resumed frontier output and zero test failures.

- [ ] **Step 5: Commit**

Run: `git add research/ckt-v4-core/src/bin/merge-frontier.rs research/ckt-v4-core/tests/frontier_resume.rs research/ckt-v4-core/src/bin/anneal-native.rs justfile; git commit -m "feat(ckt-v4): persist exact search frontiers"`

### Task 4: Frontier research note and whole-phase verification

**Files:**
- Create: `research/notes/2026-10-16-ckt-v4-phase6-frontier-format.md`
- Modify: `research/README.md`
- Modify: `docs/CKT_v4_RUST_KERNEL.md`
- Modify: `justfile`

**Interfaces:**
- Consumes: final Phase 6B CLI/schema.
- Produces: reproducible format/provenance/recovery documentation and low-memory evidence.

- [ ] **Step 1: Add a memory-stability smoke recipe**

Run a fixed small layout proposal repeatedly into the log and assert writer-owned history remains constant while the file grows; record process RSS only as observational evidence, not a portable hard threshold.

- [ ] **Step 2: Run the smoke before documenting**

Run: `just ckt-v4-frontier-memory-smoke`
Expected: invariant assertion passes and the reported log record count exceeds the in-memory leader count.

- [ ] **Step 3: Write the note and indexes**

Document schema, exact dominance, truncation recovery, provenance mismatch behavior, commands, and measured target-machine baseline placeholders only when actual measurements exist.

- [ ] **Step 4: Run the complete repository verification**

Run: `cargo fmt --manifest-path research/ckt-v4-core/Cargo.toml --check; cargo clippy --manifest-path research/ckt-v4-core/Cargo.toml --all-targets -- -D warnings; cargo test --manifest-path research/ckt-v4-core/Cargo.toml; just ckt-v4-js-test; git diff --check`
Expected: every command exits 0.

- [ ] **Step 5: Commit**

Run: `git add research/notes/2026-10-16-ckt-v4-phase6-frontier-format.md research/README.md docs/CKT_v4_RUST_KERNEL.md justfile; git commit -m "docs(ckt-v4): specify frontier archive"`
