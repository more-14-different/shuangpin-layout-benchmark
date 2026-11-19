set shell := ["pwsh", "-NoProfile", "-Command"]
set working-directory := ".."

audit:
    $env:OPENBLAS_NUM_THREADS='1'; $env:OMP_NUM_THREADS='1'; python tools/audit_toned_2126_r1_r2_c1_robustness.py --workers 2
    $env:OPENBLAS_NUM_THREADS='1'; python tools/report_toned_2126_r1_r2_c1_robustness.py

test:
    $env:OPENBLAS_NUM_THREADS='1'; python -m unittest discover -s tests -p test_toned_2126_r1_r2_c1_robustness.py
