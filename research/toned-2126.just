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
