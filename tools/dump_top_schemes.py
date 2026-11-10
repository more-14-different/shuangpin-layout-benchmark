import os
import sys
import sqlite3
from enhance_exploration_seeds import load_scheme_fixtures

def main():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    alphabet, heads, finals, s005_heads, s005_finals, s005_tone = load_scheme_fixtures(repo_root)
    sa_path = os.path.join(repo_root, "research", "exploration", "production-ckt-v4-2121-strict-avuio-20261024", "exploration.sqlite3")
    if len(sys.argv) > 1 and sys.argv[1] != 'descent' and os.path.exists(sys.argv[1]):
        db_path = os.path.abspath(sys.argv[1])
    elif os.path.exists(sa_path):
        db_path = sa_path
    else:
        db_path = os.path.join(repo_root, "research", "exploration", "production-ckt-v4-2121-finetune-20261024", "exploration.sqlite3")
        if not os.path.exists(db_path) or len(sys.argv) > 1 and sys.argv[1] == 'descent':
            db_path = os.path.join(repo_root, "research", "exploration", "production-ckt-v4-2121-descent-20261023", "exploration.sqlite3")
    con = sqlite3.connect(db_path)
    cur = con.cursor()

    def dump_schemes(label, cond):
        print(f"================ {label} ================")
        cur.execute(f"""
            SELECT ckt_v4, memory, displaced_initials, displaced_vowels, rp_max, home_floor, mx_score, first_seen_generation, state_key 
            FROM states 
            WHERE {cond} 
            ORDER BY ckt_v4 ASC 
            LIMIT 5;
        """)
        rows = cur.fetchall()
        for rank, r in enumerate(rows, 1):
            sb = r[8]
            hk = list(sb[2:29])
            fk = list(sb[29:64])
            disp_heads = [heads[i] for i in range(21) if len(heads[i]) == 1 and alphabet[hk[i]] != heads[i].upper()]
            
            keymap = {}
            for a in alphabet[:26]:
                idx = alphabet.index(a)
                h_list = [heads[i] for i in range(len(heads)) if hk[i] == idx]
                f_list = [finals[i] for i in range(len(finals)) if fk[i] == idx]
                if h_list or f_list:
                    keymap[a] = {"h": h_list, "f": f_list}
                
            print(f"Rank {rank}: CKT={r[0]:.6f} | M={r[1]}, D={r[2]}, V={r[3]} | rp_max={r[4]:.4f}, home={r[5]:.4f}, mx={r[6]:.2f} | Gen {r[7]}")
            if disp_heads:
                print(f"  Displaced Initials: {disp_heads}")
            
            keys_str = " | ".join(f"{k}:[{','.join(v['h'])}/{','.join(v['f'])}]" for k, v in sorted(keymap.items()))
            print(f"  Keymap: {keys_str}")
            print()

    dump_schemes("STAGE 1 (M<=43, D<=3)", "memory<=43 AND displaced_initials<=3")
    dump_schemes("STAGE 2 (M<=42, D<=2)", "memory<=42 AND displaced_initials<=2")
    dump_schemes("STAGE 3 (M<=41, D<=1)", "memory<=41 AND displaced_initials<=1")
    dump_schemes("STAGE 4 (M<=40, D<=0)", "memory<=40 AND displaced_initials<=0")

if __name__ == "__main__":
    main()
