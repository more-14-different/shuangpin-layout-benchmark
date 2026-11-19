set shell := ["pwsh", "-NoProfile", "-Command"]
set working-directory := ".."

publish main="../shuangpin-layout-benchmark":
    node --max-old-space-size=8192 tools/score_toned_2126_r1_r2_c1.js "{{main}}"
    foreach ($scheme in @('R1','R2','C1')) { node --max-old-space-size=8192 tools/score_toned_benchmark_columns.js --html "{{main}}/a7_CKT_R11.html" --native "{{main}}/a7_CKT_R11_integrated_materials/toned2126-r1-r2-c1/$scheme.native.json" --output "{{main}}/a7_CKT_R11_integrated_materials/toned2126-r1-r2-c1/$scheme.columns.json"; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
    python tools/complete_toned_2126_r1_r2_c1_publication.py --main "{{main}}"
    node --max-old-space-size=8192 tools/integrate_toned_2126_r1_r2_c1.js "{{main}}/a7_CKT_R11.html"
    node tests/toned-2126-r1-r2-c1-publication.browser.mjs

test:
    node tests/toned-2126-r1-r2-c1-publication.browser.mjs
    node tools/sync_keymap_link_colors.js --check --html ../shuangpin-layout-benchmark/a7_CKT_R11.html
    node --test tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs
