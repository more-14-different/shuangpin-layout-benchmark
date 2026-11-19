set shell := ["pwsh", "-NoProfile", "-Command"]
set working-directory := ".."

search:
    python tools/search_toned_2126_v52_onsets.py --workers 4
    python tools/report_toned_2126_v52_onsets.py --prepare
    python tools/audit_toned_2126_v52_onset_policies.py
    node --max-old-space-size=8192 tools/verify_toned_2126_v52_onsets.js
    python tools/report_toned_2126_v52_onsets.py

test:
    python -m unittest discover -s tests -p test_toned_2126_onsets.py
    node --max-old-space-size=8192 --test tests/auxiliary-semantics.test.mjs tests/ckt-v52.test.mjs
