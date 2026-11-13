set shell := ["pwsh", "-NoProfile", "-Command"]
set working-directory := ".."

test:
    node --test tests/toned-2126.test.mjs tests/ckt-v4-model.test.mjs

initial:
    node tools/explore_toned_2126.js --steps 60 --sample 500

expanded:
    node tools/explore_toned_2126.js --steps 400 --sample 1000 --output research/notes/2026-11-12-toned-2126-expanded.json

round2:
    node tools/explore_toned_2126.js --from research/notes/2026-11-12-toned-2126-expanded.json --starts 3 --steps 800 --sample 1500 --top 5 --policy-top 5 --seed 2127 --output research/notes/2026-11-12-toned-2126-round2.json

frontier-screen:
    node tools/frontier_toned_2126.js --from research/notes/2026-11-12-toned-2126-round2.json --mode screen --sample 3000 --output research/notes/2026-11-12-toned-2126-frontier-screen.json

frontier-full:
    node tools/frontier_toned_2126.js --from research/notes/2026-11-12-toned-2126-frontier-screen.json --mode full --resume yes --output research/notes/2026-11-12-toned-2126-frontier-full.json

verify-fast:
    node tools/verify_fast_toned_2126.js
    node tools/verify_fast_toned_2126.js research/notes/2026-11-12-toned-2126-round2.json 0

frontier-policies:
    node tools/frontier_toned_2126.js --from research/notes/2026-11-12-toned-2126-frontier-full.json --mode policies --output research/notes/2026-11-12-toned-2126-frontier-policies.json

frontier-tones:
    node tools/probe_tone_regions_2126.js research/notes/2026-11-12-toned-2126-frontier-full.json research/notes/2026-11-12-toned-2126-frontier-tones.json

frontier-vacancy:
    node tools/frontier_toned_2126.js --from research/notes/2026-11-12-toned-2126-frontier-full.json --mode probe --vacancy allow --output research/notes/2026-11-12-toned-2126-frontier-vacancy.json

frontier-robust:
    python tools/robust_toned_2126.py --input research/notes/2026-11-12-toned-2126-frontier-policies.json --output research/notes/2026-11-12-toned-2126-frontier-robust.json

joint-shard shard:
    node tools/joint_tone_search_2126.js --from research/notes/2026-11-12-toned-2126-round2.json --shard {{shard}} --shards 3 --steps 400 --sample 1500 --output research/notes/2026-11-12-toned-2126-joint-shard{{shard}}.json

joint-verify:
    node tools/verify_joint_tones_2126.js research/notes/2026-11-12-toned-2126-joint-full.json research/notes/2026-11-12-toned-2126-joint-shard0.json research/notes/2026-11-12-toned-2126-joint-shard1.json research/notes/2026-11-12-toned-2126-joint-shard2.json

alternative-full:
    node tools/frontier_toned_2126.js --from research/notes/2026-11-12-toned-2126-joint-full.json --index 1 --mode full --output research/notes/2026-11-12-toned-2126-alternative-full.json

policy-full:
    node tools/frontier_toned_2126.js --from research/notes/2026-11-12-toned-2126-frontier-policies.json --mode full --policy 21/12/24 --output research/notes/2026-11-13-toned-2126-policy-full.json

vacancy-full:
    node tools/frontier_toned_2126.js --from research/notes/2026-11-12-toned-2126-frontier-vacancy.json --mode full --vacancy allow --output research/notes/2026-11-13-toned-2126-vacancy-full.json

alternative-policies:
    node tools/frontier_toned_2126.js --from research/notes/2026-11-12-toned-2126-alternative-full.json --mode policies --output research/notes/2026-11-13-toned-2126-alternative-policies.json

alternative-robust:
    python tools/robust_toned_2126.py --input research/notes/2026-11-13-toned-2126-alternative-policies.json --output research/notes/2026-11-13-toned-2126-alternative-robust.json

alternative-policy-full:
    node tools/frontier_toned_2126.js --from research/notes/2026-11-12-toned-2126-alternative-full.json --mode full --policy 21/12/24 --output research/notes/2026-11-13-toned-2126-alternative-policy-full.json

final-tone-probe:
    node tools/probe_tone_regions_2126.js research/notes/2026-11-13-toned-2126-alternative-policies.json research/notes/2026-11-13-toned-2126-final-tone-probe.json

qempty mode:
    node tools/explore_qempty_2126.js {{mode}} research/notes/2026-11-13-toned-2126-qempty-{{mode}}.json

qempty-check mode:
    node tools/verify_qempty_2126.js research/notes/2026-11-13-toned-2126-qempty-{{mode}}.json

regroup mode:
    node tools/regroup_2126.js research/notes/2026-11-13-toned-2126-qempty-{{mode}}.json research/notes/2026-11-13-toned-2126-regroup-{{mode}}.json

regroup-26:
    node tools/regroup_2126.js research/notes/2026-11-13-toned-2126-alternative-policy-full.json research/notes/2026-11-13-toned-2126-regroup-26.json

regroup-refine mode:
    node tools/refine_regroup_2126.js research/notes/2026-11-13-toned-2126-regroup-{{mode}}.json research/notes/2026-11-13-toned-2126-regroup-{{mode}}-refine.json

regroup-test:
    node --test tests/regroup-2126.test.mjs tests/toned-2126.test.mjs tests/ckt-v4-model.test.mjs

coupled mode source:
    node tools/coupled_regroup_2126.js research/notes/2026-11-13-toned-2126-{{source}}.json research/notes/2026-11-13-toned-2126-coupled-{{mode}}.json
