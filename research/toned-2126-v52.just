set shell := ["pwsh", "-NoProfile", "-Command"]
set working-directory := ".."

# Prepare candidates with the JavaScript driver; supply --archive for another
# worktree. The ignored role tables, frozen payload and error profile must exist.
# Save the A-only prepared-JS enumeration as *-js-anchor.json.gz before using
# compiled enumeration. Tracked candidates/anchor already freeze this audit.
templates:
    node --max-old-space-size=8192 tools/audit_toned_2126_v52.js --mode templates

enumerate:
    Copy-Item -LiteralPath 'research/notes/2026-11-19-toned-2126-v52-js-anchor.json.gz' -Destination 'research/notes/2026-11-19-toned-2126-v52-policies.json.gz'
    python tools/enumerate_toned_2126_v52.py --workers 2

audit:
    python tools/robust_toned_2126_v52.py --workers 2
    node --max-old-space-size=8192 tools/audit_toned_2126_v52.js --mode verify
    python tools/report_toned_2126_v52.py

test:
    python -m unittest discover -s tests -p test_toned_2126_v52.py
    node --test tests/ckt-v52.test.mjs tests/auxiliary-semantics.test.mjs
