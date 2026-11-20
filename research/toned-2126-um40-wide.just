set shell := ["pwsh", "-NoProfile", "-Command"]
set working-directory := ".."

search workers="12":
    [System.Diagnostics.Process]::GetCurrentProcess().PriorityClass = 'BelowNormal'; python tools/search_toned_2126_um40_wide.py --workers {{workers}} --sweeps 1200
    python tools/extend_toned_2126_um40_wide_basins.py
    [System.Diagnostics.Process]::GetCurrentProcess().PriorityClass = 'BelowNormal'; python tools/search_toned_2126_um40_wide.py --workers {{workers}} --sweeps 1200
    python tools/toned_2126_v52_score_archives.py --prefix research/notes/2026-11-20-toned-2126-um40-wide
    python tools/search_toned_2126_um40_wide.py --workers {{workers}} --audit
    node --max-old-space-size=8192 tools/verify_toned_2126_v52_m4.js research/notes/2026-11-20-toned-2126-um40-wide
    python tools/report_toned_2126_um40_wide.py

test:
    python -m unittest discover -s tests -p test_toned_2126_um40*.py
    node --test tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs
