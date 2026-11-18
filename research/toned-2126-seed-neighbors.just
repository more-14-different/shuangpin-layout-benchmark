set shell := ["pwsh", "-NoProfile", "-Command"]
set working-directory := ".."

check:
    python tools/check_toned_2126_v52_seed_neighbors.py --workers 4
    node --max-old-space-size=8192 tools/verify_toned_2126_v52_seed_neighbors.js

test:
    python -m unittest discover -s tests -p test_toned_2126_seed_neighbors.py
    node --max-old-space-size=8192 --test tests/auxiliary-semantics.test.mjs
