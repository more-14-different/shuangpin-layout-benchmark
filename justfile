set shell := ["pwsh", "-NoLogo", "-NoProfile", "-Command"]

untoned-cr7e-onsets-home-search:
    node --max-old-space-size=4096 tools/search_untoned_cr7e_onsets_home.js

untoned-cr7e-onsets-home-test:
    node --test tests/untoned-cr7e-onsets-home.test.mjs tests/untoned-cr7e-onsets.test.mjs tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs

untoned-cr7e-onsets-home-verify:
    node --max-old-space-size=4096 tools/verify_untoned_cr7e_onsets_home.js

untoned-cr7e-onsets-home-policy id:
    node --expose-gc --max-old-space-size=4096 tools/verify_untoned_cr7e_onsets_home.js --policy "{{id}}"

untoned-cr7e-onsets-home-report:
    python -X utf8 tools/report_untoned_cr7e_onsets_home.py

untoned-cr7e-onsets-search:
    node --max-old-space-size=4096 tools/search_untoned_cr7e_onsets.js

untoned-cr7e-onsets-test:
    node --test tests/untoned-cr7e-onsets.test.mjs tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs

untoned-cr7e-onsets-verify:
    node --max-old-space-size=4096 tools/verify_untoned_cr7e_onsets.js

untoned-cr7e-onsets-policy id:
    node --expose-gc --max-old-space-size=4096 tools/verify_untoned_cr7e_onsets.js --policy "{{id}}"

untoned-cr7e-aeo3-search:
    node --max-old-space-size=4096 tools/search_untoned_cr7e_aeo3.js

untoned-cr7e-aeo3-test:
    node --test tests/untoned-cr7e-aeo3.test.mjs tests/untoned-cr7e-aeo42.test.mjs tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs

untoned-cr7e-aeo3-verify:
    node --max-old-space-size=4096 tools/verify_untoned_cr7e_aeo3.js

untoned-cr7e-aeo3-policy id:
    node --expose-gc --max-old-space-size=4096 tools/verify_untoned_cr7e_aeo3.js --policy "{{id}}"

untoned-cr7e-aeo3-report:
    python -X utf8 tools/report_untoned_cr7e_aeo3.py

untoned-cr7e-aeo42-search:
    node --max-old-space-size=4096 tools/search_untoned_cr7e_aeo42.js

untoned-cr7e-aeo42-test:
    node --test tests/untoned-cr7e-aeo42.test.mjs tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs

untoned-cr7e-aeo42-verify:
    node tools/verify_untoned_cr7e_aeo42.js

untoned-cr7e-aeo42-policy id:
    node --expose-gc --max-old-space-size=4096 tools/verify_untoned_cr7e_aeo42.js --policy "{{id}}"

untoned-cr7e-aeo42-report:
    python -X utf8 tools/report_untoned_cr7e_aeo42.py

untoned-cr7e-u7e-deeper-search:
    node --max-old-space-size=4096 tools/search_untoned_cr7e_u7e_deeper.js

untoned-cr7e-u7e-deeper-test:
    node --test tests/untoned-cr7e-u7e-deeper.test.mjs tests/untoned-cr7e-u7e-fair.test.mjs tests/untoned-cr7e-dropfinal.test.mjs tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs

untoned-cr7e-u7e-deeper-verify:
    node tools/verify_untoned_cr7e_u7e_deeper.js

untoned-cr7e-u7e-deeper-policy id:
    node --expose-gc --max-old-space-size=4096 tools/verify_untoned_cr7e_u7e_deeper.js --policy "{{id}}"

untoned-cr7e-u7e-deeper-report:
    python -X utf8 tools/report_untoned_cr7e_u7e_deeper.py

untoned-cr7e-u7e-fair-search phase="drop20":
    if ("{{phase}}" -eq "restored21") { node --max-old-space-size=4096 tools/continue_untoned_cr7e_u7e_fair_restored.js } else { node --max-old-space-size=4096 tools/search_untoned_cr7e_u7e_fair.js --phase "{{phase}}" }

untoned-cr7e-u7e-fair-test:
    node --test tests/untoned-cr7e-u7e-fair.test.mjs tests/untoned-cr7e-dropfinal.test.mjs tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs

untoned-cr7e-u7e-fair-verify phase="drop20":
    node tools/verify_untoned_cr7e_u7e_fair.js --phase "{{phase}}"

untoned-cr7e-u7e-fair-policy phase id:
    node --expose-gc --max-old-space-size=4096 tools/verify_untoned_cr7e_u7e_fair.js --phase "{{phase}}" --policy "{{id}}"

untoned-cr7e-u7e-fair-report phase="drop20":
    python -X utf8 tools/report_untoned_cr7e_u7e_fair.py --phase "{{phase}}"

untoned-cr7e-dropfinal-search:
    node --max-old-space-size=4096 tools/search_untoned_cr7e_dropfinal.js

untoned-cr7e-dropfinal-polish:
    node --max-old-space-size=4096 tools/polish_untoned_cr7e_dropfinal.js

untoned-cr7e-restored21-search:
    node --max-old-space-size=4096 tools/search_untoned_cr7e_restored21.js

untoned-cr7e-restored21-verify:
    node tools/verify_untoned_cr7e_restored21.js

untoned-cr7e-restored21-policy id:
    node --expose-gc --max-old-space-size=4096 tools/verify_untoned_cr7e_restored21.js --policy "{{id}}"

untoned-cr7e-restored21-report:
    python -X utf8 tools/report_untoned_cr7e_restored21.py

untoned-cr7e-dropfinal-test:
    node --test tests/untoned-cr7e-dropfinal.test.mjs tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs

untoned-cr7e-dropfinal-verify:
    node tools/verify_untoned_cr7e_dropfinal.js

untoned-cr7e-dropfinal-policy id:
    node --expose-gc --max-old-space-size=4096 tools/verify_untoned_cr7e_dropfinal.js --policy "{{id}}"

untoned-cr7e-dropfinal-report:
    python -X utf8 tools/report_untoned_cr7e_dropfinal.py

untoned-cr7e-multiblock-search:
    node --max-old-space-size=4096 tools/anneal_untoned_cr7e_multiblock.js

untoned-cr7e-multiblock-test:
    node --test tests/untoned-cr7e-multiblock.test.mjs tests/untoned-cr7e-crosswide.test.mjs tests/untoned-cr7e-blocks.test.mjs tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs

untoned-cr7e-multiblock-verify:
    node tools/verify_untoned_cr7e_multiblock.js

untoned-cr7e-multiblock-policy id:
    node --expose-gc --max-old-space-size=4096 tools/verify_untoned_cr7e_multiblock.js --policy "{{id}}"

untoned-cr7e-multiblock-report:
    python -X utf8 tools/report_untoned_cr7e_multiblock.py

untoned-cr7e-crosswide-search:
    node --max-old-space-size=4096 tools/search_untoned_cr7e_crosswide.js

untoned-cr7e-crosswide-verify:
    node tools/verify_untoned_cr7e_crosswide.js

untoned-cr7e-crosswide-policy id:
    node --expose-gc --max-old-space-size=4096 tools/verify_untoned_cr7e_crosswide.js --policy "{{id}}"

untoned-cr7e-crosswide-replay id:
    node --expose-gc --max-old-space-size=4096 tools/verify_untoned_cr7e_crosswide.js --entry "{{id}}"

untoned-cr7e-crosswide-report:
    python -X utf8 tools/report_untoned_cr7e_crosswide.py

untoned-cr7e-crosswide-test:
    node --test tests/untoned-cr7e-crosswide.test.mjs tests/untoned-cr7e-blocks.test.mjs tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs

untoned-cr7e-blocks-search:
    node --max-old-space-size=4096 tools/search_untoned_cr7e_blocks.js

untoned-cr7e-blocks-verify:
    node tools/verify_untoned_cr7e_blocks.js

untoned-cr7e-blocks-policy id:
    node --expose-gc --max-old-space-size=4096 tools/verify_untoned_cr7e_blocks.js --policy "{{id}}"

untoned-cr7e-blocks-report:
    python -X utf8 tools/report_untoned_cr7e_blocks.py

untoned-cr7e-blocks-test:
    node --test tests/untoned-cr7e-blocks.test.mjs tests/untoned-cr7e-recovery.test.mjs tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs

untoned-cr7e-recovery-search:
    node --max-old-space-size=4096 tools/anneal_untoned_cr7e_recovery.js
    node tools/polish_untoned_cr7e_recovery.js

untoned-cr7e-recovery-verify:
    node tools/verify_untoned_cr7e_recovery.js
    node tools/audit_untoned_cr7e_recovery_rings.js

untoned-cr7e-recovery-policy id:
    node --expose-gc --max-old-space-size=4096 tools/verify_untoned_cr7e_recovery.js --policy "{{id}}"

untoned-cr7e-recovery-report:
    python -X utf8 tools/report_untoned_cr7e_recovery.py

untoned-cr7e-recovery-test:
    node --test tests/untoned-cr7e-recovery.test.mjs tests/auxiliary-semantics.test.mjs
    python -X utf8 tests/test_untoned_cr7e_ranker.py

untoned-cr7e-far-prepare:
    node --max-old-space-size=6144 tools/anneal_untoned_cr7e_far.js --prepare

untoned-cr7e-far-search:
    node --max-old-space-size=4096 tools/anneal_untoned_cr7e_far.js
    node tools/polish_untoned_cr7e_far.js

untoned-cr7e-far-verify:
    node tools/replay_untoned_cr7e_far.js

untoned-cr7e-far-policy id:
    node --expose-gc --max-old-space-size=4096 tools/verify_untoned_cr7e_far.js --id "{{id}}"

untoned-cr7e-far-report:
    python -X utf8 tools/report_untoned_cr7e_far.py

untoned-cr7e-far-test:
    node --test tests/untoned-cr7e-far.test.mjs tests/untoned-cr7e-coupled.test.mjs tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs

u7x-02d-r11-columns:
    python -X utf8 tools/publish_u7x_02d_r11.py

u7x-02d-r11-policies:
    node --expose-gc --max-old-space-size=4096 tools/verify_untoned_cr7e_far.js --publication --id U7X-02d505540da0
    python -X utf8 tools/robust_untoned_v52_policy.py --input research/notes/2026-11-20-u7x-02d-r11-components-U7X-02d505540da0.json.gz --output research/notes/2026-11-20-u7x-02d-r11-robustness.json

u7x-02d-r11-publish:
    node --max-old-space-size=4096 tools/finalize_u7x_02d_r11.js --extract
    node --expose-gc --max-old-space-size=10240 tools/finalize_u7x_02d_r11.js

u7x-02d-r11-test:
    node tests/u7x-02d-r11.browser.mjs
    python -X utf8 tools/validate_u7x_02d_r11.py

untoned-cr7e-coupled-search:
    node --max-old-space-size=3072 tools/search_untoned_cr7e_coupled.js
    node --max-old-space-size=3072 tools/extend_untoned_cr7e_coupled.js
    node --max-old-space-size=3072 tools/complete_untoned_cr7e_final_pairs.js

untoned-cr7e-coupled-verify:
    node --expose-gc --max-old-space-size=4096 tools/verify_untoned_cr7e_coupled.js

untoned-cr7e-coupled-policy id:
    node --expose-gc --max-old-space-size=4096 tools/verify_untoned_cr7e_coupled.js --policies "{{id}}"

untoned-cr7e-coupled-report:
    python -X utf8 tools/report_untoned_cr7e_coupled.py

untoned-cr7e-coupled-test:
    node --test tests/untoned-cr7e-coupled.test.mjs tests/untoned-cr7e-v52.test.mjs tests/ckt-v52.test.mjs tests/auxiliary-semantics.test.mjs

untoned-cr7e-zero-n-search:
    node --max-old-space-size=2048 tools/search_untoned_cr7e_zero_n.js
    node tools/polish_untoned_cr7e_zero_n_swaps.js

untoned-cr7e-zero-n-verify:
    node --expose-gc --max-old-space-size=4096 tools/verify_untoned_cr7e_zero_n.js

untoned-cr7e-zero-n-policy id:
    node --expose-gc --max-old-space-size=4096 tools/verify_untoned_cr7e_zero_n.js --policies "{{id}}"

untoned-cr7e-zero-n-report:
    python -X utf8 tools/report_untoned_cr7e_zero_n.py

untoned-cr7e-v52-prepare:
    cargo build --release --manifest-path research/ckt-v4-core/Cargo.toml --bin score-untoned-v52-stream
    node --max-old-space-size=4096 tools/search_untoned_cr7e_v52.js --prepare

untoned-cr7e-v52-search:
    node --max-old-space-size=4096 tools/search_untoned_cr7e_v52.js

untoned-cr7e-v52-verify:
    node --expose-gc --max-old-space-size=6144 tools/verify_untoned_cr7e_v52.js
    python -X utf8 tools/audit_untoned_cr7e_memory.py
    python -X utf8 tools/report_untoned_cr7e_v52.py

untoned-cr7e-v52-policy id:
    node --expose-gc --max-old-space-size=4096 tools/policy_untoned_cr7e_v52.js --id "{{id}}"

untoned-cr7e-v52-finalize:
    node tools/finalize_untoned_cr7e_v52.js
    python -X utf8 tools/audit_untoned_cr7e_memory.py
    node --expose-gc --max-old-space-size=4096 tools/verify_untoned_cr7e_optima.js
    python -X utf8 tools/report_untoned_cr7e_v52.py

untoned-cr7e-v52-test:
    cargo test --release --manifest-path research/ckt-v4-core/Cargo.toml --bin score-untoned-v52-stream
    node --test tests/untoned-cr7e-v52.test.mjs tests/ckt-v52.test.mjs tests/auxiliary-semantics.test.mjs

recent-cr-r11:
    python -X utf8 tools/integrate_recent_cr_r11.py
    node --max-old-space-size=8192 tools/verify_recent_cr_r11.js
    python -X utf8 tools/report_recent_cr_r11.py

recent-cr-r11-test:
    node --max-old-space-size=8192 tools/verify_recent_cr_r11.js
    node --test tests/recent-cr-r11.test.mjs tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs
    node tests/recent-cr-r11.browser.mjs

cr-7e-refine-search:
    python -X utf8 tools/refine_7e_v52.py
    python -X utf8 tools/enumerate_f19_v52_policies.py --prefix research/notes/2026-11-19-7e-refinement

cr-7e-refine-audit:
    $env:OPENBLAS_NUM_THREADS='1'; $env:OMP_NUM_THREADS='1'; python -X utf8 tools/audit_f19_v52_robustness.py --prefix research/notes/2026-11-19-7e-refinement --resume-report research/notes/2026-11-19-9f-refinement-robustness.json --resume-policies research/notes/2026-11-19-9f-refinement-policies.json.gz
    python -X utf8 tools/f19_v52_ergonomics.py --prefix research/notes/2026-11-19-7e-refinement
    node --max-old-space-size=6144 tools/verify_f19_v52_audit.js --prefix research/notes/2026-11-19-7e-refinement
    $env:OPENBLAS_NUM_THREADS='1'; python -X utf8 tools/report_7e_refinement.py

cr-7e-refine-test:
    python -m unittest discover -s tests -p test_7e_refinement.py
    node --test tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs

cr-9f-refine-search:
    python -X utf8 tools/refine_9f_v52.py
    python -X utf8 tools/enumerate_f19_v52_policies.py --prefix research/notes/2026-11-19-9f-refinement

cr-9f-refine-audit:
    $env:OPENBLAS_NUM_THREADS='1'; $env:OMP_NUM_THREADS='1'; python -X utf8 tools/audit_f19_v52_robustness.py --prefix research/notes/2026-11-19-9f-refinement --resume-report research/notes/2026-11-19-cd3-refinement-robustness.json --resume-policies research/notes/2026-11-19-cd3-refinement-policies.json.gz
    python -X utf8 tools/f19_v52_ergonomics.py --prefix research/notes/2026-11-19-9f-refinement
    node --max-old-space-size=6144 tools/verify_f19_v52_audit.js --prefix research/notes/2026-11-19-9f-refinement
    $env:OPENBLAS_NUM_THREADS='1'; python -X utf8 tools/report_9f_refinement.py

cr-9f-refine-test:
    python -m unittest discover -s tests -p test_9f_refinement.py
    node --test tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs

cd3-refine-search:
    python -X utf8 tools/refine_cd3_v52.py
    python -X utf8 tools/enumerate_f19_v52_policies.py --prefix research/notes/2026-11-19-cd3-refinement

cd3-refine-audit:
    $env:OPENBLAS_NUM_THREADS='1'; $env:OMP_NUM_THREADS='1'; python -X utf8 tools/audit_f19_v52_robustness.py --prefix research/notes/2026-11-19-cd3-refinement
    python -X utf8 tools/f19_v52_ergonomics.py --prefix research/notes/2026-11-19-cd3-refinement
    node --max-old-space-size=6144 tools/verify_f19_v52_audit.js --prefix research/notes/2026-11-19-cd3-refinement
    $env:OPENBLAS_NUM_THREADS='1'; python -X utf8 tools/report_cd3_refinement.py

cd3-refine-test:
    python -m unittest discover -s tests -p test_cd3_refinement.py
    node --test tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs

cr-1f9-remove-p-search:
    python -X utf8 tools/search_1f9_remove_p.py
    python -X utf8 tools/prepare_1f9_remove_p_controls.py
    python -X utf8 tools/enumerate_f19_v52_policies.py --prefix research/notes/2026-11-19-1f9-remove-p

cr-1f9-remove-p-audit:
    $env:OPENBLAS_NUM_THREADS='1'; $env:OMP_NUM_THREADS='1'; python -X utf8 tools/audit_f19_v52_robustness.py --prefix research/notes/2026-11-19-1f9-remove-p
    python -X utf8 tools/f19_v52_ergonomics.py --prefix research/notes/2026-11-19-1f9-remove-p
    node --max-old-space-size=6144 tools/verify_f19_v52_audit.js --prefix research/notes/2026-11-19-1f9-remove-p
    python -X utf8 tools/report_1f9_remove_p.py

cr-1f9-remove-p-test:
    python -m unittest discover -s tests -p test_1f9_remove_p.py
    node --test tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs

lan213-v52-followup-prepare:
    python -X utf8 tools/prepare_lan213_v52_followup.py
    python -X utf8 tools/check_lan213_v52_recovery.py
    python -X utf8 tools/enumerate_f19_v52_policies.py --prefix research/notes/2026-11-19-lan213-v52-followup

lan213-v52-followup:
    $env:OPENBLAS_NUM_THREADS='1'; $env:OMP_NUM_THREADS='1'; python -X utf8 tools/audit_f19_v52_robustness.py --prefix research/notes/2026-11-19-lan213-v52-followup
    python -X utf8 tools/f19_v52_ergonomics.py --prefix research/notes/2026-11-19-lan213-v52-followup
    node --max-old-space-size=6144 tools/verify_f19_v52_audit.js --prefix research/notes/2026-11-19-lan213-v52-followup
    $env:OPENBLAS_NUM_THREADS='1'; python -X utf8 tools/report_lan213_v52_followup.py

lan213-v52-followup-test:
    python -m unittest discover -s tests -p test_lan213_v52_followup.py
    node --test tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs

f19-v52-audit-prepare:
    python -X utf8 tools/prepare_f19_v52_audit.py
    node --max-old-space-size=2048 tools/export_f19_v52_policy_templates.js
    python -X utf8 tools/enumerate_f19_v52_policies.py

f19-v52-audit:
    $env:OPENBLAS_NUM_THREADS='1'; $env:OMP_NUM_THREADS='1'; python -X utf8 tools/audit_f19_v52_robustness.py --workers 3
    python -X utf8 tools/f19_v52_ergonomics.py
    node --max-old-space-size=6144 tools/verify_f19_v52_audit.js
    python -X utf8 tools/report_f19_v52_audit.py

f19-v52-audit-test:
    python -m unittest discover -s tests -p test_f19_v52_audit.py
    node --test tests/cr-frontier-auxiliary.test.mjs tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs

continuous-shuangpin-5500:
    python -X utf8 tools/continuous_shuangpin.py

continuous-shuangpin-prepare:
    python -X utf8 tools/prepare_continuous_shuangpin.py

continuous-shuangpin-test:
    python -m unittest discover -s tests -p test_continuous_shuangpin.py
    node --test tests/auxiliary-semantics.test.mjs

cr-six-root-regroup-v52:
    python -X utf8 tools/search_cr_pair_group_swaps_v52.py --root-regroup
    node --max-old-space-size=4096 tools/verify_cr_76_aeo_v52.js research/notes/2026-11-19-cr-six-root-regroup-v52.json --selected-only

cr-pair-group-swaps-v52:
    python -X utf8 tools/search_cr_pair_group_swaps_v52.py
    node --max-old-space-size=4096 tools/verify_cr_76_aeo_v52.js research/notes/2026-11-18-cr-pair-group-swaps-v52.json --selected-only

cr-retroflex-top-v52:
    python -X utf8 tools/search_cr_retroflex_home_v52.py --row top
    node --max-old-space-size=4096 tools/verify_cr_76_aeo_v52.js research/notes/2026-11-18-cr-retroflex-top-v52.json --selected-only

cr-retroflex-bottom-v52:
    python -X utf8 tools/search_cr_retroflex_home_v52.py --row bottom
    node --max-old-space-size=4096 tools/verify_cr_76_aeo_v52.js research/notes/2026-11-18-cr-retroflex-bottom-v52.json --selected-only

cr-retroflex-home-v52:
    python -X utf8 tools/search_cr_retroflex_home_v52.py
    node --max-old-space-size=4096 tools/verify_cr_76_aeo_v52.js research/notes/2026-11-18-cr-retroflex-home-v52.json --selected-only

cr-aeo-onsets-v52:
    python -X utf8 tools/search_cr_aeo_onsets_v52.py
    node --max-old-space-size=4096 tools/verify_cr_76_aeo_v52.js research/notes/2026-11-18-cr-aeo-onsets-v52.json --selected-only

cr-76-aeo-v52:
    node --max-old-space-size=4096 tools/export_ckt_v52_templates.js
    python -X utf8 tools/search_cr_76_aeo_v52.py
    node --max-old-space-size=4096 tools/verify_cr_76_aeo_v52.js

ckt-v52-score:
    node --max-old-space-size=6144 tools/score_ckt_v52.js

ckt-v52-integrate:
    node --max-old-space-size=6144 tools/integrate_ckt_v52.js

ckt-v52-test:
    node --test tests/ckt-v52.test.mjs tests/ckt-block-error.test.mjs tests/auxiliary-semantics.test.mjs tests/toned-native-policy.test.mjs

ckt-v52-browser:
    node tests/ckt-v52.browser.mjs

ckt-long-export python="python":
    & "{{python}}" -X utf8 tools/export_ckt_long_error_profile.py

ckt-block-export python="python":
    & "{{python}}" -X utf8 tools/export_ckt_long_error_profile.py --all-roles --output research/.cache/ckt-long-code-audit-20261118/error-profile-all-roles.json

ckt-block-audit samples="100000":
    node --max-old-space-size=6144 tools/audit_ckt_block_error.js --samples "{{samples}}"

ckt-block-test:
    node --test tests/ckt-block-error.test.mjs tests/ckt-long-continuation.test.mjs tests/ckt-v4-model.test.mjs tests/toned-native-policy.test.mjs tests/auxiliary-semantics.test.mjs

ckt-long-audit samples="100000":
    node --max-old-space-size=6144 tools/audit_ckt_long_continuation.js --samples "{{samples}}"

ckt-long-test:
    node --test tests/ckt-long-continuation.test.mjs tests/ckt-v4-model.test.mjs tests/toned-native-policy.test.mjs tests/auxiliary-semantics.test.mjs

cr-lan-aeo-heads phase="all" workers="12":
    python -X utf8 tools/search_cr_lan_aeo_heads.py --phase "{{phase}}" --workers "{{workers}}"

cr-lan-aeo-heads-verify:
    python -X utf8 tools/verify_cr_lan_aeo_heads.py

cr-lan-aeo-heads-test:
    python -m unittest discover -s tests -p test_cr_lan_aeo_heads.py
    node --test tests/auxiliary-semantics.test.mjs tests/toned-native-policy.test.mjs

cr-lan-f19-combined phase="all" workers="12":
    python -X utf8 tools/search_cr_lan_f19_combined.py --phase "{{phase}}" --workers "{{workers}}"

cr-lan-f19-combined-verify:
    python -X utf8 tools/verify_cr_lan_f19_combined.py

cr-lan-f19-combined-targeted phase="propose" workers="4":
    python -X utf8 tools/explore_cr_lan_f19_two_swap.py --phase "{{phase}}" --workers "{{workers}}"

cr-lan-f19-combined-refine phase="joint1" workers="12":
    python -X utf8 tools/refine_cr_lan_f19_full.py --phase "{{phase}}" --workers "{{workers}}"

cr-lan-f19-combined-target rounds="3" workers="12":
    python -X utf8 tools/refine_cr_lan_f19_target.py --rounds "{{rounds}}" --workers "{{workers}}"

cr-lan-f19-combined-test:
    python -m unittest discover -s tests -p test_cr_lan_f19_combined.py
    node --test tests/auxiliary-semantics.test.mjs tests/toned-native-policy.test.mjs

cr-lan-f19-regroup phase="all" workers="4":
    python -X utf8 tools/regroup_cr_lan_f19_roots.py --phase "{{phase}}" --workers "{{workers}}"

cr-lan-f19-regroup-verify:
    python -X utf8 tools/verify_cr_lan_f19_regroup.py

cr-lan-f19-regroup-test:
    python -m unittest discover -s tests -p test_cr_lan_f19_regroup.py
    node --test tests/auxiliary-semantics.test.mjs tests/toned-native-policy.test.mjs

cr-gpu-benchmark:
    python -X utf8 tools/integrate_cr_gpu_r11.py
    node tools/sync_keymap_link_colors.js

cr-gpu-benchmark-test:
    python -m unittest discover -s tests -p test_cr_gpu_r11.py
    node tests/cr-gpu-r11.browser.mjs

cr-toned-stability:
    $env:OPENBLAS_NUM_THREADS='2'; $env:OMP_NUM_THREADS='2'; python -X utf8 tools/rank_cr_toned_stable_policies.py

cr-stable-benchmark:
    python -X utf8 tools/integrate_cr_stable_r11.py
    node tools/sync_keymap_link_colors.js

cr-stable-benchmark-test:
    python -m unittest discover -s tests -p test_cr_toned_stability.py
    node --test tests/toned-native-policy.test.mjs tests/toned-contract-audit.test.mjs tests/auxiliary-semantics.test.mjs
    node tests/cr-stable-r11.browser.mjs

cr-stable-neighbors phase="local":
    python -X utf8 tools/explore_cr_stable_neighbors.py --phase "{{phase}}" --limit 180

cr-stable-neighbors-build:
    cargo build --locked --release --jobs 2 --manifest-path research/ckt-v4-core/Cargo.toml --bin audit-toned-rhyme-neighbors --bin score-toned-stream

cr-stable-neighbors-test:
    python -m unittest discover -s tests -p test_cr_stable_neighbors.py
    node --test tests/toned-native-policy.test.mjs tests/cr-frontier-auxiliary.test.mjs tests/cr-stable-neighbors.test.mjs

cr-stable-neighbors-auxiliary:
    node --max-old-space-size=6144 tools/optimize_cr_frontier_auxiliary.js --layouts research/notes/2026-11-16-cr-stable-neighbors-finalists.json --output research/notes/2026-11-16-cr-stable-neighbors-auxiliary.json --macro-output research/.cache/cr-stable-neighbors-20261116/macro-input.json
    $env:OPENBLAS_NUM_THREADS='2'; $env:OMP_NUM_THREADS='2'; python -X utf8 tools/rank_cr_toned_stable_policies.py --input research/notes/2026-11-16-cr-stable-neighbors-auxiliary.json --output research/notes/2026-11-16-cr-stable-neighbors-robustness.json

cr-stable-neighbors-report:
    node --max-old-space-size=6144 tools/verify_cr_stable_neighbors.js
    python -X utf8 tools/report_cr_stable_neighbors.py

cr-balanced-followup phase="local" limit="240" workers="8":
    python -X utf8 tools/explore_cr_stable_neighbors.py --parents f0ae939a38 --phase "{{phase}}" --output research/.cache/cr-balanced-followup-20261116 --prefix research/notes/2026-11-16-cr-balanced-followup --limit "{{limit}}" --workers "{{workers}}"

cr-balanced-followup-auxiliary:
    node --max-old-space-size=6144 tools/optimize_cr_frontier_auxiliary.js --layouts research/notes/2026-11-16-cr-balanced-followup-finalists.json --output research/notes/2026-11-16-cr-balanced-followup-auxiliary.json --macro-output research/.cache/cr-balanced-followup-20261116/macro-input.json
    $env:OPENBLAS_NUM_THREADS='2'; $env:OMP_NUM_THREADS='2'; python -X utf8 tools/rank_cr_toned_stable_policies.py --input research/notes/2026-11-16-cr-balanced-followup-auxiliary.json --output research/notes/2026-11-16-cr-balanced-followup-robustness.json

cr-balanced-followup-verify:
    node --max-old-space-size=6144 tools/verify_cr_stable_neighbors.js --prefix research/notes/2026-11-16-cr-balanced-followup
    python -X utf8 tools/report_cr_stable_neighbors.py --prefix research/notes/2026-11-16-cr-balanced-followup --output research/.cache/cr-balanced-followup-20261116 --json-only

cr-f0-origin-complete workers="12":
    python -X utf8 tools/complete_cr_f0_origin.py --workers "{{workers}}"

cr-f0-origin-verify:
    node --max-old-space-size=6144 tools/verify_cr_stable_neighbors.js --prefix research/notes/2026-11-17-cr-f0-origin-completion --fixed-only --source-auxiliary research/notes/2026-11-16-cr-balanced-followup-auxiliary.json

cr-f0-origin-test:
    python -m unittest discover -s tests -p test_cr_f0_origin_completion.py
    node --test tests/cr-f0-origin-completion.test.mjs tests/cr-stable-neighbors.test.mjs tests/auxiliary-semantics.test.mjs

cr-667-neighbors phase="coupled":
    python -X utf8 tools/explore_cr_667_neighbors.py --phase "{{phase}}"

cr-667-neighbors-verify:
    node --max-old-space-size=6144 tools/verify_cr_stable_neighbors.js --prefix research/notes/2026-11-17-cr-667-neighbors
    python -X utf8 tools/verify_cr_667_macro.py

cr-667-neighbors-auxiliary:
    node --max-old-space-size=6144 tools/optimize_cr_frontier_auxiliary.js --layouts research/notes/2026-11-17-cr-667-neighbors-finalists.json --output research/notes/2026-11-17-cr-667-neighbors-auxiliary.json --macro-output research/.cache/cr-667-neighbors-20261117/macro-input.json
    $env:OPENBLAS_NUM_THREADS='2'; $env:OMP_NUM_THREADS='2'; python -X utf8 tools/rank_cr_toned_stable_policies.py --input research/notes/2026-11-17-cr-667-neighbors-auxiliary.json --output research/notes/2026-11-17-cr-667-neighbors-robustness.json

cr-667-neighbors-test:
    python -m unittest discover -s tests -p test_cr_667_neighbors.py
    node --test tests/cr-f0-origin-completion.test.mjs tests/cr-stable-neighbors.test.mjs tests/auxiliary-semantics.test.mjs

cr-87-neighbors phase="coupled" width="10":
    python -X utf8 tools/explore_cr_87_neighbors.py --phase "{{phase}}" --width "{{width}}"

cr-87-neighbors-auxiliary:
    node --max-old-space-size=6144 tools/optimize_cr_frontier_auxiliary.js --layouts research/notes/2026-11-17-cr-87-neighbors-finalists.json --output research/notes/2026-11-17-cr-87-neighbors-auxiliary.json --macro-output research/.cache/cr-87-neighbors-20261117/macro-input.json
    $env:OPENBLAS_NUM_THREADS='2'; $env:OMP_NUM_THREADS='2'; python -X utf8 tools/rank_cr_toned_stable_policies.py --input research/notes/2026-11-17-cr-87-neighbors-auxiliary.json --output research/notes/2026-11-17-cr-87-neighbors-robustness.json

cr-87-neighbors-verify:
    node --max-old-space-size=6144 tools/verify_cr_stable_neighbors.js --prefix research/notes/2026-11-17-cr-87-neighbors
    python -X utf8 tools/verify_cr_87_macro.py

cr-87-neighbors-test:
    python -m unittest discover -s tests -p test_cr_87_neighbors.py
    node --test tests/cr-87-neighbors.test.mjs tests/cr-stable-neighbors.test.mjs tests/auxiliary-semantics.test.mjs

cr-667-regroup phase="joint":
    python -X utf8 tools/regroup_cr_667_roots.py --phase "{{phase}}"

cr-667-regroup-verify:
    python -X utf8 tools/verify_cr_667_regroup.py

cr-667-regroup-test:
    python -m unittest discover -s tests -p test_cr_667_root_regroup.py
    node --test tests/cr-667-root-regroup.test.mjs tests/toned-native-policy.test.mjs tests/auxiliary-semantics.test.mjs

cr-667-zero phase="carriers":
    python -X utf8 tools/search_cr_667_zero_carriers.py --phase "{{phase}}"

cr-667-zero-verify:
    python -X utf8 tools/verify_cr_667_zero_carriers.py

cr-667-zero-test:
    python -X utf8 -m unittest discover -s tests -p test_cr_667_zero_carriers.py
    node --test tests/cr-667-zero-carriers.test.mjs tests/toned-native-policy.test.mjs tests/auxiliary-semantics.test.mjs

cr-667-m24 phase="local":
    python -X utf8 tools/search_cr_667_m24_joint.py --phase "{{phase}}"

cr-667-m24-verify:
    python -X utf8 tools/verify_cr_667_m24_joint.py

cr-667-m24-test:
    cargo test --locked --jobs 2 --manifest-path research/ckt-v4-core/Cargo.toml --lib pinky::tests
    python -X utf8 -m unittest discover -s tests -p test_cr_667_m24_joint.py
    node --test tests/cr-667-m24-joint.test.mjs tests/toned-native-policy.test.mjs tests/auxiliary-semantics.test.mjs

cr-m24-portfolio-build:
    pwsh -NoProfile -File tools/run_cr_m24_portfolio.ps1 -Mode Build

cr-m24-portfolio-test:
    python -X utf8 -m unittest discover -s tests -p test_cr_m24_portfolio.py
    node --test tests/auxiliary-semantics.test.mjs tests/toned-native-policy.test.mjs

cr-m24-portfolio-audit:
    pwsh -NoProfile -File tools/run_cr_m24_portfolio.ps1 -Mode Audit -Output research/.cache/cr-m24-portfolio-audit

cr-lan-fixed phase="transfer":
    python -X utf8 tools/explore_cr_lan_fixed.py --phase "{{phase}}"

cr-lan-fixed-verify:
    python -X utf8 tools/verify_cr_lan_fixed.py

cr-lan-fixed-policy:
    python -X utf8 tools/replay_cr_lan_policies.py
    python -X utf8 tools/verify_cr_lan_fixed.py --policy-replay

cr-lan-fixed-test:
    python -X utf8 -m unittest discover -s tests -p test_cr_lan_fixed.py
    node --max-old-space-size=6144 --test --test-concurrency=1 tests/cr-lan-fixed.test.mjs tests/auxiliary-semantics.test.mjs tests/toned-native-policy.test.mjs

cr-lan-f19-stability:
    python -X utf8 tools/prepare_cr_lan_stability.py
    node --max-old-space-size=6144 tools/optimize_cr_frontier_auxiliary.js --layouts research/notes/2026-11-17-cr-lan-f19-stability-finalists.json --output research/notes/2026-11-17-cr-lan-f19-stability-auxiliary.json
    just cr-lan-f19-stability-rank
    node --max-old-space-size=6144 tools/verify_cr_lan_stability.js
    python -X utf8 -m unittest discover -s tests -p test_cr_lan_stability.py

cr-lan-f19-stability-rank:
    $env:OPENBLAS_NUM_THREADS='2'; $env:OMP_NUM_THREADS='2'; python -X utf8 tools/rank_cr_toned_stable_policies.py --input research/notes/2026-11-17-cr-lan-f19-stability-auxiliary.json --output research/notes/2026-11-17-cr-lan-f19-stability-robustness.json
    $env:OPENBLAS_NUM_THREADS='2'; $env:OMP_NUM_THREADS='2'; python -X utf8 tools/rank_cr_toned_stable_policies.py --constrained --input research/notes/2026-11-17-cr-lan-f19-stability-auxiliary.json --output research/notes/2026-11-17-cr-lan-f19-stability-constrained-robustness.json

cr-lan-f19-benchmark:
    python -X utf8 tools/integrate_cr_lan_f19_r11.py
    node tools/sync_keymap_link_colors.js
    node --max-old-space-size=6144 tools/verify_cr_lan_f19_r11.js

cr-lan-f19-benchmark-test:
    python -X utf8 -m unittest discover -s tests -p test_cr_lan_f19_r11.py
    node tests/cr-production5-r11.browser.mjs --lan-f19

cr-lan-zero-carriers:
    python -X utf8 tools/compare_cr_lan_zero_carriers.py
    python -X utf8 -m unittest discover -s tests -p test_cr_lan_zero_carriers.py

lan-aeo-all:
    node --max-old-space-size=8192 tools/enumerate_lan_aeo.js --family toned --output research/notes/2026-11-18-lan-aeo-toned.json
    node --max-old-space-size=8192 tools/enumerate_lan_aeo.js --family untoned --output research/notes/2026-11-18-lan-aeo-untoned.json
    python -X utf8 tools/complete_lan_aeo_comparison.py --phase toned-columns
    node --max-old-space-size=8192 tools/score_lan_aeo_untoned_columns.js
    python -X utf8 tools/complete_lan_aeo_comparison.py --phase assemble
    python -X utf8 -m unittest discover -s tests -p test_lan_aeo_comparison.py

cr-lan-213-prepare:
    python -X utf8 tools/prepare_cr_lan_213.py
    node --max-old-space-size=6144 tools/verify_cr_stable_neighbors.js --prefix research/notes/2026-11-18-cr-lan-213 --fixed-only --source-auxiliary research/notes/2026-11-18-cr-lan-213-provenance.json
    python -X utf8 tools/prepare_cr_lan_213.py --freeze

cr-lan-213-test:
    python -X utf8 -m unittest discover -s tests -p test_cr_lan_213.py
    node --max-old-space-size=6144 --test --test-concurrency=1 tests/auxiliary-semantics.test.mjs tests/toned-native-policy.test.mjs

cr-production5-benchmark:
    python -X utf8 tools/integrate_cr_production5_r11.py
    node tools/sync_keymap_link_colors.js

cr-production5-benchmark-test:
    python -m unittest discover -s tests -p test_cr_production5_r11.py
    node --max-old-space-size=6144 tools/audit_cr_production5_r11.js
    node tests/cr-production5-r11.browser.mjs

cr-frontier-followup output="research/.cache/cr-frontier-followup-20261116":
    cargo build --locked --release --jobs 2 --manifest-path research/ckt-v4-core/Cargo.toml --bin audit-toned-rhyme-neighbors
    python -X utf8 tools/explore_cr_frontier_followup.py --output "{{output}}" --phase local
    python -X utf8 tools/explore_cr_frontier_followup.py --output "{{output}}" --phase coupled --limit 120 --seed 20261116
    python -X utf8 tools/explore_cr_frontier_followup.py --output "{{output}}" --phase anneal --steps 24 --seed 20261117
    python -X utf8 tools/explore_cr_frontier_followup.py --output "{{output}}" --phase export

cr-frontier-followup-test:
    python -m unittest discover -s tests -p test_cr_frontier_followup.py
    python -m unittest discover -s tests -p test_cr_anneal.py
    node --test tests/auxiliary-semantics.test.mjs
    node --test tests/cr-frontier-auxiliary.test.mjs

cr-frontier-followup-auxiliary:
    node --max-old-space-size=6144 tools/optimize_cr_frontier_auxiliary.js --layouts research/notes/2026-11-16-cr-frontier-followup-auxiliary-inputs.json

cr-frontier-followup-report:
    node --max-old-space-size=6144 tools/verify_cr_frontier_followup.js
    python -X utf8 tools/report_cr_frontier_followup.py

cr-frontier-benchmark:
    python -X utf8 tools/integrate_cr_frontier_r11.py
    node tools/sync_keymap_link_colors.js

cr-frontier-benchmark-test:
    python -m unittest discover -s tests -p test_cr_frontier_r11.py
    node tests/cr-frontier-r11-browser.test.mjs
    node tools/audit_keymap_link_colors.mjs

snow-jiandao-ui:
    python -X utf8 tools/integrate_snow_jiandao_toned_r11.py --ui-only
    node tools/sync_keymap_link_colors.js

unified-keyboard-filter-test: snow-jiandao-ui
    node --test tests/unified-keyboard-query.test.mjs tests/snow-jiandao-toned-r11.test.mjs
    node tests/unified-keyboard-filter-browser.test.mjs

toned-detail-kpis-test: snow-jiandao-ui
    node tests/toned-detail-kpis.browser.mjs

toned-contract-refresh:
    python -X utf8 tools/refresh_toned_r11_contracts.py

toned-contract-audit-test:
    node --test tests/toned-contract-audit.test.mjs tests/toned-benchmark-columns.test.mjs tests/auxiliary-semantics.test.mjs
    node tests/toned-contract-audit.browser.mjs
    node tests/toned-detail-kpis.browser.mjs
    node tools/audit_keymap_link_colors.mjs

snow-jiandao-ui-test: snow-jiandao-ui
    node --test tests/snow-jiandao-toned-r11.test.mjs tests/keymap-link-colors.test.mjs tests/auxiliary-semantics.test.mjs
    node tests/snow-jiandao-toned-browser.test.mjs

snow-jiandao-benchmark:
    python -X utf8 tools/integrate_snow_jiandao_toned_r11.py
    node tools/sync_keymap_link_colors.js

snow-jiandao-benchmark-test:
    node --test tests/toned-benchmark-columns.test.mjs tests/snow-jiandao-toned-r11.test.mjs tests/auxiliary-semantics.test.mjs
    node tests/toned-benchmark-browser.test.mjs

toned-representative-benchmark:
    node tools/benchmark_toned_representatives.js
    python tools/report_toned_representatives.py

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

ckt-v51-toned-mars10-rust-threehop max_evaluations="400" beam="3" duty_ms="5" checkpoint_every="25":
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin trial-toned-pareto -- research/.cache/ckt-v51-toned-native-corpus.bin research/.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json tools/ckt_v4_upstream_role_tables.json --proposal-space joint --beam "{{beam}}" --max-evaluations "{{max_evaluations}}" --duty-ms "{{duty_ms}}" --checkpoint-every "{{checkpoint_every}}" --resume --checkpoint research/.cache/ckt-v51-toned-marsfirst-zh-e-mars10-v3-threehop-checkpoint.json --output research/.cache/ckt-v51-toned-marsfirst-zh-e-mars10-v3-threehop-result.json

ckt-v51-toned-mars10-anchor-prepare:
    node tools/export_toned_mars10_anchor.js

ckt-v51-toned-mars10-anchor-trial max_evaluations="340" duty_ms="5" checkpoint_every="25" proposal_space="joint": ckt-v51-toned-mars10-anchor-prepare
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin trial-toned-pareto -- research/.cache/ckt-v51-toned-native-corpus.bin research/.cache/ckt-v51-toned-mars10-anchor-sh-p-u-k.json tools/ckt_v4_upstream_role_tables.json --proposal-space "{{proposal_space}}" --max-evaluations "{{max_evaluations}}" --duty-ms "{{duty_ms}}" --checkpoint-every "{{checkpoint_every}}" --checkpoint research/.cache/ckt-v51-toned-mars10-anchor-{{proposal_space}}-checkpoint.json --output research/.cache/ckt-v51-toned-mars10-anchor-{{proposal_space}}-result.json

ckt-v51-toned-mars10-anchor-resume max_evaluations="340" duty_ms="5" checkpoint_every="25" proposal_space="joint":
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin trial-toned-pareto -- research/.cache/ckt-v51-toned-native-corpus.bin research/.cache/ckt-v51-toned-mars10-anchor-sh-p-u-k.json tools/ckt_v4_upstream_role_tables.json --proposal-space "{{proposal_space}}" --max-evaluations "{{max_evaluations}}" --duty-ms "{{duty_ms}}" --checkpoint-every "{{checkpoint_every}}" --resume --checkpoint research/.cache/ckt-v51-toned-mars10-anchor-{{proposal_space}}-checkpoint.json --output research/.cache/ckt-v51-toned-mars10-anchor-{{proposal_space}}-result.json

ckt-v51-toned-mars10-fourhop-prepare:
    node tools/export_toned_mars10_anchor.js --first-move sh:P --first-move ch:S --rhyme-move home:u:K --expected-score 9.43067603120692 --output research/.cache/ckt-v51-toned-mars10-anchor-sh-p-ch-s-u-k.json

ckt-v51-toned-mars10-fourhop-trial max_evaluations="340" duty_ms="5" checkpoint_every="25" proposal_space="joint": ckt-v51-toned-mars10-fourhop-prepare
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin trial-toned-pareto -- research/.cache/ckt-v51-toned-native-corpus.bin research/.cache/ckt-v51-toned-mars10-anchor-sh-p-ch-s-u-k.json tools/ckt_v4_upstream_role_tables.json --proposal-space "{{proposal_space}}" --max-evaluations "{{max_evaluations}}" --duty-ms "{{duty_ms}}" --checkpoint-every "{{checkpoint_every}}" --checkpoint research/.cache/ckt-v51-toned-mars10-fourhop-{{proposal_space}}-checkpoint.json --output research/.cache/ckt-v51-toned-mars10-fourhop-{{proposal_space}}-result.json

ckt-v51-toned-mars10-fourhop-resume max_evaluations="340" duty_ms="5" checkpoint_every="25" proposal_space="joint":
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin trial-toned-pareto -- research/.cache/ckt-v51-toned-native-corpus.bin research/.cache/ckt-v51-toned-mars10-anchor-sh-p-ch-s-u-k.json tools/ckt_v4_upstream_role_tables.json --proposal-space "{{proposal_space}}" --max-evaluations "{{max_evaluations}}" --duty-ms "{{duty_ms}}" --checkpoint-every "{{checkpoint_every}}" --resume --checkpoint research/.cache/ckt-v51-toned-mars10-fourhop-{{proposal_space}}-checkpoint.json --output research/.cache/ckt-v51-toned-mars10-fourhop-{{proposal_space}}-result.json

ckt-v51-toned-mars10-audit-er: ckt-v51-toned-mars10-fourhop-prepare
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin audit-er-unfreezing

ckt-v51-toned-mars10-anneal steps="5000" initial_temp="0.02" final_temp="0.0001" duty_ms="5" checkpoint_every="50" seed="1410786": ckt-v51-toned-mars10-fourhop-prepare
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin anneal-toned-mars10 -- research/.cache/ckt-v51-toned-native-corpus.bin research/.cache/ckt-v51-toned-mars10-anchor-sh-p-ch-s-u-k.json tools/ckt_v4_upstream_role_tables.json --steps "{{steps}}" --initial-temp "{{initial_temp}}" --final-temp "{{final_temp}}" --duty-ms "{{duty_ms}}" --checkpoint-every "{{checkpoint_every}}" --seed "{{seed}}" --checkpoint research/.cache/ckt-v51-toned-mars10-anneal-checkpoint.json --output research/.cache/ckt-v51-toned-mars10-anneal-result.json

ckt-v51-toned-mars10-anneal-resume steps="5000" initial_temp="0.02" final_temp="0.0001" duty_ms="5" checkpoint_every="50" seed="1410786":
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin anneal-toned-mars10 -- research/.cache/ckt-v51-toned-native-corpus.bin research/.cache/ckt-v51-toned-mars10-anchor-sh-p-ch-s-u-k.json tools/ckt_v4_upstream_role_tables.json --steps "{{steps}}" --initial-temp "{{initial_temp}}" --final-temp "{{final_temp}}" --duty-ms "{{duty_ms}}" --checkpoint-every "{{checkpoint_every}}" --seed "{{seed}}" --resume --checkpoint research/.cache/ckt-v51-toned-mars10-anneal-checkpoint.json --output research/.cache/ckt-v51-toned-mars10-anneal-result.json

ckt-v51-toned-mars10-ordinary-d1 duty_ms="5":
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin audit-toned-ordinary-d1 -- research/.cache/ckt-v51-toned-native-corpus.bin research/.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json tools/ckt_v4_upstream_role_tables.json --anchor research/.cache/ckt-v51-toned-mars10-anneal-checkpoint.json --duty-ms "{{duty_ms}}" --output research/.cache/ckt-v51-toned-ordinary-d1-results.json

ckt-v51-toned-mars10-ordinary-d1-anneal anneal_steps="300" start_d1="p:K" duty_ms="5":
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin audit-toned-ordinary-d1 -- research/.cache/ckt-v51-toned-native-corpus.bin research/.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json tools/ckt_v4_upstream_role_tables.json --anchor research/.cache/ckt-v51-toned-mars10-anneal-checkpoint.json --start-d1 "{{start_d1}}" --duty-ms "{{duty_ms}}" --anneal-steps "{{anneal_steps}}" --output research/.cache/ckt-v51-toned-ordinary-d1-results.json --anneal-checkpoint research/.cache/ckt-v51-toned-ordinary-d1-anneal-checkpoint.json --anneal-output research/.cache/ckt-v51-toned-ordinary-d1-anneal-result.json

ckt-v51-toned-mars10-ordinary-d2 duty_ms="5":
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin audit-toned-ordinary-d2 -- research/.cache/ckt-v51-toned-native-corpus.bin research/.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json tools/ckt_v4_upstream_role_tables.json --anchor research/.cache/ckt-v51-toned-ordinary-d1-anneal-checkpoint.json --duty-ms "{{duty_ms}}" --output research/.cache/ckt-v51-toned-ordinary-d2-results.json

ckt-v51-toned-mars10-ordinary-d2-anneal anneal_steps="300" duty_ms="5":
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin audit-toned-ordinary-d2 -- research/.cache/ckt-v51-toned-native-corpus.bin research/.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json tools/ckt_v4_upstream_role_tables.json --anchor research/.cache/ckt-v51-toned-ordinary-d1-anneal-checkpoint.json --duty-ms "{{duty_ms}}" --anneal-steps "{{anneal_steps}}" --output research/.cache/ckt-v51-toned-ordinary-d2-results.json --anneal-checkpoint research/.cache/ckt-v51-toned-ordinary-d2-anneal-checkpoint.json --anneal-output research/.cache/ckt-v51-toned-ordinary-d2-anneal-result.json

ckt-v51-toned-mars10-ordinary-d2-anneal-from start_d2="s:C" anneal_steps="300" duty_ms="5":
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin audit-toned-ordinary-d2 -- research/.cache/ckt-v51-toned-native-corpus.bin research/.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json tools/ckt_v4_upstream_role_tables.json --anchor research/.cache/ckt-v51-toned-ordinary-d1-anneal-checkpoint.json --start-d2 "{{start_d2}}" --duty-ms "{{duty_ms}}" --anneal-steps "{{anneal_steps}}" --output research/.cache/ckt-v51-toned-ordinary-d2-results.json --anneal-checkpoint research/.cache/ckt-v51-toned-ordinary-d2-anneal-checkpoint.json --anneal-output research/.cache/ckt-v51-toned-ordinary-d2-anneal-result.json

ckt-v51-toned-joint-stage1 duration_secs="18000" steps="8000" duty_ms="5" checkpoint_every="25":
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin anneal-joint-toned-full -- research/.cache/ckt-v51-toned-native-corpus.bin research/.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json tools/ckt_v4_upstream_role_tables.json --anchor research/.cache/ckt-v51-toned-ordinary-d1-anneal-checkpoint.json --max-d 1 --duration-secs "{{duration_secs}}" --steps "{{steps}}" --duty-ms "{{duty_ms}}" --checkpoint-every "{{checkpoint_every}}" --checkpoint research/.cache/ckt-v51-toned-joint-stage1-checkpoint.json --output research/.cache/ckt-v51-toned-joint-stage1-result.json

ckt-v51-toned-joint-stage1-resume duration_secs="18000" steps="8000" duty_ms="5" checkpoint_every="25":
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin anneal-joint-toned-full -- research/.cache/ckt-v51-toned-native-corpus.bin research/.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json tools/ckt_v4_upstream_role_tables.json --anchor research/.cache/ckt-v51-toned-ordinary-d1-anneal-checkpoint.json --max-d 1 --duration-secs "{{duration_secs}}" --steps "{{steps}}" --duty-ms "{{duty_ms}}" --checkpoint-every "{{checkpoint_every}}" --resume --checkpoint research/.cache/ckt-v51-toned-joint-stage1-checkpoint.json --output research/.cache/ckt-v51-toned-joint-stage1-result.json

ckt-v51-toned-joint-stage2 duration_secs="18000" steps="8000" duty_ms="5" checkpoint_every="25":
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin anneal-joint-toned-full -- research/.cache/ckt-v51-toned-native-corpus.bin research/.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json tools/ckt_v4_upstream_role_tables.json --anchor research/.cache/ckt-v51-toned-joint-stage1-result.json --max-d 2 --duration-secs "{{duration_secs}}" --steps "{{steps}}" --duty-ms "{{duty_ms}}" --checkpoint-every "{{checkpoint_every}}" --checkpoint research/.cache/ckt-v51-toned-joint-stage2-checkpoint.json --output research/.cache/ckt-v51-toned-joint-stage2-result.json

ckt-v51-toned-joint-stage2-resume duration_secs="18000" steps="8000" duty_ms="5" checkpoint_every="25":
    $env:CARGO_BUILD_JOBS = '1'; cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin anneal-joint-toned-full -- research/.cache/ckt-v51-toned-native-corpus.bin research/.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json tools/ckt_v4_upstream_role_tables.json --anchor research/.cache/ckt-v51-toned-joint-stage1-result.json --max-d 2 --duration-secs "{{duration_secs}}" --steps "{{steps}}" --duty-ms "{{duty_ms}}" --checkpoint-every "{{checkpoint_every}}" --resume --checkpoint research/.cache/ckt-v51-toned-joint-stage2-checkpoint.json --output research/.cache/ckt-v51-toned-joint-stage2-result.json

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
ckt-v51-toned-rhyme-neighbors-prepare:
    python tools/prepare_toned_rhyme_neighbors.py

ckt-v51-toned-rhyme-neighbors: ckt-v51-toned-rhyme-neighbors-prepare
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin audit-toned-rhyme-neighbors -- research/.cache/ckt-v51-toned-native-corpus.bin tools/ckt_v4_upstream_role_tables.json research/.cache/toned-rhyme-neighbors-job.json research/.cache/toned-rhyme-neighbors-results.json

ckt-v51-toned-rhyme-neighbors-export:
    python tools/export_toned_rhyme_neighbors.py
    node tools/score_toned_2121_ckt_v51.js --layouts research/notes/2026-11-12-toned-rhyme-neighbors-finalists.json --policy 12/213/24 --shape AVUIO --output research/notes/2026-11-12-toned-rhyme-neighbors-js-verify.json

ckt-v51-toned-rhyme-refine:
    python tools/refine_toned_rhyme_neighbors.py
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin audit-toned-rhyme-neighbors -- research/.cache/ckt-v51-toned-native-corpus.bin tools/ckt_v4_upstream_role_tables.json research/.cache/toned-rhyme-refine-job.json research/.cache/toned-rhyme-refine-results.json
    python tools/export_toned_rhyme_neighbors.py --job research/.cache/toned-rhyme-refine-job.json --results research/.cache/toned-rhyme-refine-results.json --prefix research/notes/2026-11-12-toned-rhyme-refine
    node tools/score_toned_2121_ckt_v51.js --layouts research/notes/2026-11-12-toned-rhyme-refine-finalists.json --policy 12/213/24 --shape AVUIO --output research/notes/2026-11-12-toned-rhyme-refine-js-verify.json

ckt-v51-toned-regroup:
    python tools/search_toned_rhyme_regroup.py
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin audit-toned-rhyme-neighbors -- research/.cache/ckt-v51-toned-native-corpus.bin tools/ckt_v4_upstream_role_tables.json research/.cache/toned-regroup-job.json research/.cache/toned-regroup-results.json
    python tools/export_toned_rhyme_neighbors.py --job research/.cache/toned-regroup-job.json --results research/.cache/toned-regroup-results.json --prefix research/notes/2026-11-12-toned-regroup
    node tools/score_toned_2121_ckt_v51.js --layouts research/notes/2026-11-12-toned-regroup-finalists.json --policy 12/213/24 --shape AVUIO --output research/notes/2026-11-12-toned-regroup-js-verify.json

# Exact dual-empty search, D <= 2 and M_lower <= 23 unless explicitly changed.
ckt-v51-toned-dual-regroup tag="dual-regroup-r0":
    python tools/search_toned_dual_empty_regroup.py --prefix research/.cache/{{tag}} --tag {{tag}}
    cargo build --release --manifest-path research/ckt-v4-core/Cargo.toml --bin audit-toned-rhyme-neighbors
    python tools/run_toned_neighbor_shards.py research/.cache/{{tag}} --workers 3
    python tools/export_toned_rhyme_neighbors.py --job research/.cache/{{tag}}-job.json --results research/.cache/{{tag}}-scores.json --prefix research/notes/2026-11-12-{{tag}}

ckt-v51-toned-dual-regroup-refine tag previous operators="root,key,first" leaders="1":
    python tools/search_toned_dual_empty_regroup.py --prefix research/.cache/{{tag}} --tag {{tag}} --previous research/.cache/{{previous}} --operators {{operators}} --leaders {{leaders}}
    cargo build --release --manifest-path research/ckt-v4-core/Cargo.toml --bin audit-toned-rhyme-neighbors
    python tools/run_toned_neighbor_shards.py research/.cache/{{tag}} --workers 3
    python tools/export_toned_rhyme_neighbors.py --job research/.cache/{{tag}}-job.json --results research/.cache/{{tag}}-scores.json --prefix research/notes/2026-11-12-{{tag}}

ckt-v51-toned-regroup-refine:
    python tools/search_toned_rhyme_regroup.py --refine
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin audit-toned-rhyme-neighbors -- research/.cache/ckt-v51-toned-native-corpus.bin tools/ckt_v4_upstream_role_tables.json research/.cache/toned-regroup-refine-job.json research/.cache/toned-regroup-refine-results.json
    python tools/export_toned_rhyme_neighbors.py --job research/.cache/toned-regroup-refine-job.json --results research/.cache/toned-regroup-refine-results.json --prefix research/notes/2026-11-12-toned-regroup-refine
    node tools/score_toned_2121_ckt_v51.js --layouts research/notes/2026-11-12-toned-regroup-refine-finalists.json --policy 12/213/24 --shape AVUIO --output research/notes/2026-11-12-toned-regroup-refine-js-verify.json

ckt-v51-toned-regroup-combine:
    python tools/search_toned_rhyme_regroup.py --combine
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin audit-toned-rhyme-neighbors -- research/.cache/ckt-v51-toned-native-corpus.bin tools/ckt_v4_upstream_role_tables.json research/.cache/toned-regroup-combine-job.json research/.cache/toned-regroup-combine-results.json
    python tools/export_toned_rhyme_neighbors.py --job research/.cache/toned-regroup-combine-job.json --results research/.cache/toned-regroup-combine-results.json --prefix research/notes/2026-11-12-toned-regroup-combine
    node tools/score_toned_2121_ckt_v51.js --layouts research/notes/2026-11-12-toned-regroup-combine-finalists.json --policy 12/213/24 --shape AVUIO --output research/notes/2026-11-12-toned-regroup-combine-js-verify.json

ckt-v51-toned-regroup-combine-refine:
    python tools/search_toned_rhyme_regroup.py --combine --refine
    cargo run --release --manifest-path research/ckt-v4-core/Cargo.toml --bin audit-toned-rhyme-neighbors -- research/.cache/ckt-v51-toned-native-corpus.bin tools/ckt_v4_upstream_role_tables.json research/.cache/toned-regroup-combine-refine-job.json research/.cache/toned-regroup-combine-refine-results.json
    python tools/export_toned_rhyme_neighbors.py --job research/.cache/toned-regroup-combine-refine-job.json --results research/.cache/toned-regroup-combine-refine-results.json --prefix research/notes/2026-11-12-toned-regroup-combine-refine
    node tools/score_toned_2121_ckt_v51.js --layouts research/notes/2026-11-12-toned-regroup-combine-refine-finalists.json --policy 12/213/24 --shape AVUIO --output research/notes/2026-11-12-toned-regroup-combine-refine-js-verify.json
