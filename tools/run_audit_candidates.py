import subprocess
import json
import os

base_dir = r"d:\CtoD\Default\桌面\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2121"
audit_exe = os.path.join(base_dir, r"research\ckt-v4-core\target\release\audit-layout-full.exe")
corpus = os.path.join(base_dir, r"research\.cache\ckt-v4-native-corpus.bin")
schemes = os.path.join(base_dir, r"research\.cache\ckt-v4-all-schemes.json")
snapshot = os.path.join(base_dir, r"tools\ckt_v4_upstream_role_tables.json")
ergonomics = os.path.join(base_dir, r"research\.cache\ckt-v4-ergonomics.json")

with open(os.path.join(base_dir, r"tools\selected_pareto_preview.json"), "r", encoding="utf-8") as f:
    candidates = json.load(f)

results = []
for c in candidates:
    print(f"Auditing {c['id']} (U={c['u']})...")
    cmd = [
        audit_exe,
        "--layout", c["state_key"],
        "--corpus", corpus,
        "--schemes", schemes,
        "--snapshot", snapshot,
        "--ergonomics", ergonomics,
        "--reference", "S005"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", cwd=base_dir)
    if res.returncode != 0:
        print(f"Audit failed for {c['id']}: {res.stderr}")
        continue
    audit_data = json.loads(res.stdout)
    audit_data["candidateId"] = c["id"]
    audit_data["candidateU"] = c["u"]
    audit_data["candidateTier"] = "Stretch" if c["u"] >= 360 and audit_data["cktV4"] <= 9.705581 else ("Tier-A" if c["u"] >= 356 and audit_data["cktV4"] <= 9.720 else "Tier-B")
    audit_data["hammingToBcw"] = c["hamming_to_bcw"]
    results.append(audit_data)
    print(f"  -> Audited successfully! CKT={audit_data['cktV4']:.6f}, U={audit_data['common399']['u']}, MX={audit_data['ergonomics']['mxScore']:.2f}")

out_path = os.path.join(base_dir, r"research\notes\2026-10-29-pareto-audit-full.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2, ensure_ascii=False)

print(f"\nSuccessfully audited {len(results)} candidates and saved to {out_path}")
