set shell := ["pwsh", "-NoProfile", "-Command"]
set working-directory := ".."

search workers="12":
    [System.Diagnostics.Process]::GetCurrentProcess().PriorityClass = 'BelowNormal'; python tools/refine_toned_2126_v52_r2.py --workers {{workers}}
    python tools/toned_2126_v52_score_archives.py --prefix research/notes/2026-11-19-toned-2126-v52-r2-refine
    python tools/audit_toned_2126_v52_m4_policies.py --prefix research/notes/2026-11-19-toned-2126-v52-r2-refine
    node --max-old-space-size=8192 tools/verify_toned_2126_v52_m4.js research/notes/2026-11-19-toned-2126-v52-r2-refine
    python tools/report_toned_2126_v52_r2.py

test:
    python -m unittest discover -s tests -p test_toned_2126_r2_refine.py
    node --test tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs
