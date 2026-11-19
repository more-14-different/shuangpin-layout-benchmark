set shell := ["pwsh", "-NoProfile", "-Command"]
set working-directory := ".."

search:
    python tools/search_toned_2126_v52_m19.py --workers 4
    python tools/complete_toned_2126_v52_m19_fronts.py
    python tools/audit_toned_2126_v52_m19_policies.py
    node --max-old-space-size=8192 tools/verify_toned_2126_v52_m19.js
    python tools/report_toned_2126_v52_m19.py

test:
    python -m unittest discover -s tests -p test_toned_2126_m19.py
    node --max-old-space-size=8192 --test tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs
