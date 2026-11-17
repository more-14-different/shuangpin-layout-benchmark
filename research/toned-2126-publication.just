set shell := ["pwsh", "-NoProfile", "-Command"]
set working-directory := ".."

rank:
    uv run --python 3.14 --with numpy==2.5.4 --with cupy-cuda12x==14.2.0 tools/rank_toned_2126_publication_policies.py

score representative:
    node --max-old-space-size=8192 tools/score_toned_2126_publication.js {{representative}} a7_CKT_R11_integrated_materials/toned2126/{{representative}}.json
    node --max-old-space-size=8192 tools/score_toned_benchmark_columns.js --native a7_CKT_R11_integrated_materials/toned2126/{{representative}}.native.json --output a7_CKT_R11_integrated_materials/toned2126/{{representative}}.columns.json

score-all:
    foreach ($representative in @('polished','longrun','26','keep','newKeep','newSwap')) { just --justfile research/toned-2126-publication.just score $representative; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }

publish html="a7_CKT_R11.html":
    python tools/integrate_toned_2126_representatives.py --html '{{html}}'

test:
    node --max-old-space-size=8192 --test tests/toned-filter-payload.test.mjs tests/toned-2126-publication-catalog.test.mjs tests/toned-contract-audit.test.mjs tests/toned-benchmark-columns.test.mjs tests/snow-jiandao-toned-r11.test.mjs tests/keymap-link-colors.test.mjs

browser html="a7_CKT_R11.html":
    $env:R11_HTML='{{html}}'; node tests/toned-2126-representatives.browser.mjs
