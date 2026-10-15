# CKT research workspace

New CKT v4 algorithm development lives in this repository. The historical
`rime-snow-pinyin/scripts/research` files remain where their frozen R11 imports,
Snow Pinyin dictionaries and replay reports live; they are not copied wholesale
because such a copy cannot run independently and would immediately diverge.

The migration boundary is API-based:

- `ckt-v4-core/` owns compact competition, motor-cost and incremental-update code;
- `../tools/` owns corpus/HTML adapters and JS reference exporters;
- `../docs/CKT_v4_BINARY_FORMAT.md` specifies the phase-2 streamed row fixture;
- `.cache/` holds restored replay packages and large cross-language fixtures;
- `checkpoints/` holds resumable annealing state.

Both `.cache/` and `checkpoints/` are ignored. Future 21×21 and four-code-top
annealers should call the Rust core here; old v3 scripts in Snow Pinyin are
historical evidence, not the place for new v4 algorithm changes.
