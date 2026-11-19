set shell := ["pwsh", "-NoProfile", "-Command"]
set working-directory := ".."

search workers="8":
    python tools/refine_toned_2126_v52_m4.py --workers {{workers}}
    python tools/audit_toned_2126_v52_m4_policies.py
    node --max-old-space-size=8192 tools/verify_toned_2126_v52_m4.js
    python tools/report_toned_2126_v52_m4.py

test:
    python -m unittest discover -s tests -p test_toned_2126_m4.py
    node --max-old-space-size=8192 --test tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs
