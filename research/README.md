# CKT research workspace

New CKT v4 algorithm development lives in this repository. The historical
`rime-snow-pinyin/scripts/research` files remain where their frozen R11 imports,
Snow Pinyin dictionaries and replay reports live; they are not copied wholesale
because such a copy cannot run independently and would immediately diverge.

The migration boundary is API-based:

- `ckt-v4-core/` owns compact competition, motor-cost and incremental-update code;
- `../tools/` owns corpus/HTML adapters and JS reference exporters;
- `../docs/CKT_v4_BINARY_FORMAT.md` specifies the phase-2 streamed row fixture;
- `../docs/CKT_v4_NATIVE_CORPUS.md` specifies the phase-3 shared corpus and
  fixed-topology scheme update boundary;
- `../docs/CKT_v4_ANNEALING.md` specifies the phase-4 constrained state,
  hybrid incremental/full annealer and resumable checkpoint contract;
- `../docs/CKT_v4_SEARCH_NEIGHBORHOOD.md` specifies the phase-5 expanded
  neighborhood, optional M/D/V guards and topology capability boundary;
- `notes/2026-10-16-ckt-v4-phase6-regular-frontier-design.md` specifies the
  phase-6 regular-topology capability audit, compound moves and Pareto boundary;
- `notes/2026-10-16-ckt-v4-phase6-capability-audit.md` records the reproducible
  840-scheme regular-topology boundary and its source hash;
- `notes/2026-10-16-ckt-v4-phase6-frontier-format.md` specifies append-only
  candidate recovery and deterministic exact CKT/M/D/V Pareto merging;
- `.cache/` holds restored replay packages and large cross-language fixtures;
- `checkpoints/` holds resumable annealing state.

Both `.cache/` and `checkpoints/` are ignored. The first 21×21/21×26 CPU
annealer now calls the Rust core here; old v3 scripts in Snow Pinyin are
historical evidence, not the place for new v4 algorithm changes.

Run `just ckt-v4-capability-audit` to rebuild the ignored all-scheme fixture and
capability JSON and to assert the documented regular/special topology boundary.
Run `just ckt-v4-frontier-smoke` for a real 21x26 archive/merge path, and
`just ckt-v4-frontier-memory-smoke` for the bounded-writer-history assertion.
