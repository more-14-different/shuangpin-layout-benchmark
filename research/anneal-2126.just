set shell := ["pwsh", "-NoProfile", "-Command"]
set working-directory := ".."

setup:
    uv venv --python 3.14 .venv-anneal
    uv pip install --python .venv-anneal/Scripts/python.exe -r research/anneal-2126-requirements.txt

prepare snow:
    node tools/prepare_anneal_2126.js research/.cache/anneal-2126-bundle '{{snow}}'

test:
    .venv-anneal/Scripts/python.exe -m unittest discover -s tests -p test_anneal_2126.py
    node --test tests/regroup-2126.test.mjs tests/toned-2126.test.mjs tests/ckt-v4-model.test.mjs

run hours="24":
    .venv-anneal/Scripts/python.exe tools/anneal_2126.py --bundle research/.cache/anneal-2126-bundle --out research/.cache/anneal-2126-run --hours {{hours}} --batch 64 --gpu-mb 1024 --node-mb 8192 --duty 0.45

stop:
    New-Item -ItemType File -Path research/.cache/anneal-2126-run/STOP -Force

verify route snow:
    node tools/verify_anneal_2126.js research/.cache/anneal-2126-bundle research/.cache/anneal-2126-run/best-{{route}}.json '{{snow}}'
