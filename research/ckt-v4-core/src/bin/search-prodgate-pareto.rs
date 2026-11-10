use ckt_v4_core::{
    CognitiveParameters, ErgonomicFixture, KeyAlphabet, Kind, NativeCorpus, ProjectedMotor,
    Projection, RegularLayout, RoleTables, SchemeFixture, SchemeState, Summary,
    composite_score, layout_distance, layout_state_key, resolve, summarize,
};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

const HEADS: [&str; 27] = [
    "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "zh", "ch", "sh", "r",
    "z", "c", "s", "A", "E", "O", "W", "Y", "YU",
];
const FINALS: [&str; 35] = [
    "a", "ai", "an", "ang", "ao", "e", "ei", "en", "eng", "er", "i", "ia", "ian", "iang", "iao",
    "ie", "in", "ing", "iong", "iu", "o", "ong", "ou", "u", "ua", "uai", "uan", "uang", "ui", "un",
    "uo", "v", "van", "ve", "vn",
];

const PRODGATE_MAX_RP_S2: f64 = 0.0418079455791114;
const PRODGATE_MAX_RP: f64 = 0.05104491472386687;
const PRODGATE_MIN_HOME_FLOOR: f64 = 0.3507563825435487;
const PRODGATE_MAX_W: f64 = 0.03623226230403664;
const PRODGATE_MAX_Y: f64 = 0.06868516416255256;
const PRODGATE_MIN_MX: f64 = 140.842;
const EPS: f64 = 1e-12;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrackRates {
    character: f64,
    word2: f64,
    word3: f64,
    word4: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TracksReport {
    keytao: TrackRates,
    sanpin: TrackRates,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErgonomicsReport {
    rp_s2: f64,
    rp_max: f64,
    home_floor: f64,
    w_max: f64,
    y_max: f64,
    mx_score: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ParetoCandidate {
    id: String,
    seed_source: String,
    tier: String,
    state_key: String,
    ckt_v4: f64,
    memory: usize,
    displaced_initials: usize,
    displaced_vowels: usize,
    u: usize,
    collision_buckets: usize,
    affected_syllables: usize,
    hamming_to_bcw: usize,
    tracks: TracksReport,
    ergonomics: ErgonomicsReport,
    passes_all_prod_gate: bool,
    head_keys: Vec<u8>,
    final_keys: Vec<u8>,
    tone: [u8; 5],
}

fn load_motor(
    corpus: &NativeCorpus,
    alphabet: &KeyAlphabet,
    snapshot: &Path,
) -> Result<ProjectedMotor, String> {
    let native = RoleTables::from_snapshot_json(
        alphabet,
        &fs::read_to_string(snapshot).map_err(|error| error.to_string())?,
        0.0,
    )?;
    let mut projections = HashMap::new();
    for (key, extension) in &corpus.header().extension_maps {
        let key = key.chars().next().ok_or("empty extension key")?;
        let global = alphabet.index_of(key).ok_or("unknown extension key")?;
        let donors = extension
            .donors
            .iter()
            .map(|(donor, weight)| {
                let donor = donor.chars().next().ok_or("empty donor key")?;
                alphabet
                    .index_of(donor)
                    .ok_or("unknown donor key")
                    .map(|index| (index, *weight))
            })
            .collect::<Result<_, _>>()?;
        projections.insert(
            global,
            Projection {
                donors,
                distance_guard_multiplier: extension.distance_guard_multiplier,
            },
        );
    }
    ProjectedMotor::new(native, projections)
}

fn score_modes(
    corpus: &NativeCorpus,
    scheme: &SchemeState,
    motor: &ProjectedMotor,
    parameters: CognitiveParameters,
) -> Result<Vec<Summary>, String> {
    [ckt_v4_core::InputMode::Keytao, ckt_v4_core::InputMode::Sanpin]
        .into_iter()
        .map(|mode| {
            let generated = corpus.generate(scheme, mode)?;
            let outcomes = resolve(&generated.rows, |code| {
                motor.cost(code).map(|value| value.upper_ms)
            })?;
            summarize(&generated.rows, &outcomes, parameters)
        })
        .collect()
}

fn layout_from_hex(hex_str: &str, id: &str) -> Result<RegularLayout, String> {
    let raw = (0..hex_str.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex_str[i..i + 2], 16))
        .collect::<Result<Vec<u8>, _>>()
        .map_err(|e| format!("invalid hex: {e}"))?;
    if raw.len() != 69 {
        return Err(format!("expected 69 bytes stateKey, got {}", raw.len()));
    }
    let capacity = [raw[0], raw[1]];
    let head_keys = raw[2..29].to_vec();
    let final_keys = raw[29..64].to_vec();
    let tone: [u8; 5] = raw[64..69].try_into().map_err(|_| "tone length must be 5")?;
    Ok(RegularLayout {
        id: id.to_owned(),
        capacity,
        head_keys,
        final_keys,
        tone,
    })
}

fn compute_u_and_collisions(pinyin_map: &[[u8; 2]], common_pinyin: &[u16], layout: &RegularLayout) -> (usize, usize, usize) {
    let mut code_map: BTreeMap<(u8, u8), usize> = BTreeMap::new();
    for &p_idx in common_pinyin {
        let [h, f] = pinyin_map[usize::from(p_idx)];
        let hk = layout.head_keys[h as usize];
        let fk = layout.final_keys[f as usize];
        *code_map.entry((hk, fk)).or_default() += 1;
    }
    let u = code_map.len();
    let mut collision_buckets = 0;
    let mut affected = 0;
    for &count in code_map.values() {
        if count > 1 {
            collision_buckets += 1;
            affected += count;
        }
    }
    (u, collision_buckets, affected)
}

struct SearchContext<'a> {
    corpus: &'a NativeCorpus,
    schemes: &'a SchemeFixture,
    alphabet: &'a KeyAlphabet,
    motor: &'a ProjectedMotor,
    ergo_fixture: &'a ErgonomicFixture,
    ergo_corpus: &'a ckt_v4_core::MovingHandCorpus,
    reference_summaries: &'a [Summary],
    bcw_layout: &'a RegularLayout,
}

fn evaluate_candidate(
    ctx: &SearchContext,
    layout: &RegularLayout,
    seed_source: &str,
    tier: &str,
) -> Result<ParetoCandidate, String> {
    let layout_state = ctx.schemes.scheme_state(layout)?;
    let candidate_summaries = score_modes(ctx.corpus, &layout_state, ctx.motor, CognitiveParameters::default())?;
    let ckt_score = composite_score(&candidate_summaries, ctx.reference_summaries)?;
    let loads = ctx.ergo_fixture.load_model.diagnose(layout)?;
    let mx_score = ctx.ergo_fixture.moving_hand.evaluate(&layout_state, ctx.ergo_corpus)?.score;
    let diag = layout.diagnostics(ctx.alphabet, &ctx.schemes.heads, &ctx.schemes.finals)?;
    let (u, buckets, affected) = compute_u_and_collisions(&ctx.schemes.pinyin_map, &ctx.schemes.common_pinyin, layout);
    let hamming = layout_distance(layout, ctx.bcw_layout)?;

    let passes_rp_s2 = loads.rp_s2 <= PRODGATE_MAX_RP_S2 + EPS;
    let passes_rp_max = loads.rp_max <= PRODGATE_MAX_RP + EPS;
    let passes_home = loads.home_floor >= PRODGATE_MIN_HOME_FLOOR - EPS;
    let passes_w = loads.w_max <= PRODGATE_MAX_W + EPS;
    let passes_y = loads.y_max <= PRODGATE_MAX_Y + EPS;
    let passes_mx = mx_score >= PRODGATE_MIN_MX - EPS;
    let passes_all = passes_rp_s2 && passes_rp_max && passes_home && passes_w && passes_y && passes_mx;

    let kt = &candidate_summaries[0];
    let sp = &candidate_summaries[1];

    let kt_char = kt.track(Kind::Character).map(|t| t.selection_rate).unwrap_or(0.0);
    let kt_w2 = kt.track(Kind::Word2).map(|t| t.selection_rate).unwrap_or(0.0);
    let kt_w3 = kt.track(Kind::Word3).map(|t| t.selection_rate).unwrap_or(0.0);
    let kt_w4 = kt.track(Kind::Word4).map(|t| t.selection_rate).unwrap_or(0.0);

    let sp_char = sp.track(Kind::Character).map(|t| t.selection_rate).unwrap_or(0.0);
    let sp_w2 = sp.track(Kind::Word2).map(|t| t.selection_rate).unwrap_or(0.0);
    let sp_w3 = sp.track(Kind::Word3).map(|t| t.selection_rate).unwrap_or(0.0);
    let sp_w4 = sp.track(Kind::Word4).map(|t| t.selection_rate).unwrap_or(0.0);

    Ok(ParetoCandidate {
        id: layout.id.clone(),
        seed_source: seed_source.to_owned(),
        tier: tier.to_owned(),
        state_key: layout_state_key(layout),
        ckt_v4: ckt_score,
        memory: diag.memory,
        displaced_initials: diag.displaced_initials,
        displaced_vowels: diag.displaced_vowels,
        u,
        collision_buckets: buckets,
        affected_syllables: affected,
        hamming_to_bcw: hamming,
        tracks: TracksReport {
            keytao: TrackRates {
                character: kt_char,
                word2: kt_w2,
                word3: kt_w3,
                word4: kt_w4,
            },
            sanpin: TrackRates {
                character: sp_char,
                word2: sp_w2,
                word3: sp_w3,
                word4: sp_w4,
            },
        },
        ergonomics: ErgonomicsReport {
            rp_s2: loads.rp_s2,
            rp_max: loads.rp_max,
            home_floor: loads.home_floor,
            w_max: loads.w_max,
            y_max: loads.y_max,
            mx_score,
        },
        passes_all_prod_gate: passes_all,
        head_keys: layout.head_keys.clone(),
        final_keys: layout.final_keys.clone(),
        tone: layout.tone,
    })
}

fn main() -> Result<(), String> {
    let t_start = Instant::now();
    let base_dir = PathBuf::from("D:/CtoD/Default/桌面/Code/Lua/inputMethod/shuangpin-layout-benchmark-prod-2121");
    let corpus_path = base_dir.join("research/.cache/ckt-v4-native-corpus.bin");
    let schemes_path = base_dir.join("research/.cache/ckt-v4-all-schemes.json");
    let snapshot_path = base_dir.join("tools/ckt_v4_upstream_role_tables.json");
    let ergo_path = base_dir.join("research/.cache/ckt-v4-ergonomics.json");

    println!("Loading fixtures...");
    let corpus = NativeCorpus::open(&corpus_path)?;
    let schemes = SchemeFixture::open(&schemes_path)?;
    let alphabet = KeyAlphabet::new(&corpus.header().key_alphabet)?;
    let motor = load_motor(&corpus, &alphabet, &snapshot_path)?;
    let ergo_fixture = ErgonomicFixture::open(&ergo_path)?;
    let ergo_corpus = ergo_fixture.moving_hand.corpus("daily", "native-punctuation")?;

    let reference_input = schemes
        .schemes
        .iter()
        .find(|scheme| scheme.id == "S005")
        .ok_or_else(|| "reference scheme S005 is absent")?;
    let reference_state = SchemeState::compile(reference_input, &alphabet, corpus.header().pinyin_count)?;
    let reference_summaries = score_modes(&corpus, &reference_state, &motor, CognitiveParameters::default())?;

    // Load original BCW layout
    let bcw_seed_path = base_dir.join("research/seeds/ckt-v4/a7-closure-multi-seed-20261029/seed-01-BCW-3c47744cf2f7.json");
    let bcw_json = fs::read_to_string(&bcw_seed_path).map_err(|e| e.to_string())?;
    let bcw_layout: RegularLayout = serde_json::from_str(&bcw_json).map_err(|e| e.to_string())?;

    let ctx = SearchContext {
        corpus: &corpus,
        schemes: &schemes,
        alphabet: &alphabet,
        motor: &motor,
        ergo_fixture: &ergo_fixture,
        ergo_corpus: &ergo_corpus,
        reference_summaries: &reference_summaries,
        bcw_layout: &bcw_layout,
    };

    println!("Loading 11 seeds (8 Basin 01 + 3 Production Top-3)...");
    let prod_seeds = [
        ("gen0107-p5", "1515010f0c0503130d0b060a070910170a160411190212111111121818160a090d1012040c11040b050f09021901130d03030f05070217031306011806110a04081514000e"),
        ("gen0076-p8", "1515010f0c0503130d0b060a070910170a160411190212111111121818160a090d1005040c11040b050f09021901130d12030f12070217031306011806110a03081514000e"),
        ("gen0170-p7", "1515010f0c0503130d0b060a070910170a160411190212111111121818160a090d1012040c11040b030f09021901130d050303050702170f1306011806110a04081514000e"),
    ];

    let mut all_seeds: Vec<RegularLayout> = Vec::new();
    for (id, sk) in &prod_seeds {
        all_seeds.push(layout_from_hex(sk, id)?);
    }

    let a7_path = base_dir.join("research/.cache/a7-43-candidates.json");
    let a7_content = fs::read_to_string(a7_path).map_err(|e| e.to_string())?;
    let a7_data: serde_json::Value = serde_json::from_str(&a7_content).map_err(|e| e.to_string())?;
    let basin01_ids = [
        "BCW-3c47744cf2f7", "BCW-1a11061c8293", "BCW-4119add30591", "BCW-9d3ffcc750b2",
        "BCW-106d38018322", "BCW-511d69ea162d", "BCW-6a2c3cb77e53", "BCW-2662bd325b7d"
    ];
    for input in a7_data["schemes"].as_array().unwrap() {
        let id = input["id"].as_str().unwrap();
        if basin01_ids.contains(&id) {
            let scheme_input: ckt_v4_core::SchemeInput = serde_json::from_value(input.clone()).map_err(|e| e.to_string())?;
            if let Ok(layout) = schemes.compile_layout(&scheme_input, &alphabet) {
                all_seeds.push(layout);
            }
        }
    }

    println!("Total starting seeds: {}", all_seeds.len());

    let mut evaluated_states: BTreeSet<String> = BTreeSet::new();
    let mut pareto_candidates: Vec<ParetoCandidate> = Vec::new();

    // Fast check closure
    let check_candidate = |layout: &RegularLayout, seed_name: &str, candidates: &mut Vec<ParetoCandidate>, seen: &mut BTreeSet<String>| -> Result<bool, String> {
        let sk = layout_state_key(layout);
        if seen.contains(&sk) {
            return Ok(false);
        }
        seen.insert(sk);

        // 1. Capacity check
        if layout.capacity != [21, 21] {
            return Ok(false);
        }
        // 2. MDV fast check
        let Ok(diag) = layout.diagnostics(&alphabet, &schemes.heads, &schemes.finals) else {
            return Ok(false);
        };
        if diag.memory > 40 || diag.displaced_initials > 0 || diag.displaced_vowels > 5 {
            return Ok(false);
        }

        // 3. Fast Loads check
        let Ok(loads) = ergo_fixture.load_model.diagnose(layout) else {
            return Ok(false);
        };
        if loads.rp_s2 > PRODGATE_MAX_RP_S2 + EPS
            || loads.rp_max > PRODGATE_MAX_RP + EPS
            || loads.home_floor < PRODGATE_MIN_HOME_FLOOR - EPS
            || loads.w_max > PRODGATE_MAX_W + EPS
            || loads.y_max > PRODGATE_MAX_Y + EPS
        {
            return Ok(false);
        }

        // 4. Fast Moving Hand check
        let Ok(layout_state) = schemes.scheme_state(layout) else {
            return Ok(false);
        };
        let Ok(mx_score) = ergo_fixture.moving_hand.evaluate(&layout_state, &ergo_corpus).map(|r| r.score) else {
            return Ok(false);
        };
        if mx_score < PRODGATE_MIN_MX - EPS {
            return Ok(false);
        }

        // 5. Compute U
        let (u, _, _) = compute_u_and_collisions(&schemes.pinyin_map, &schemes.common_pinyin, layout);

        // Found a fully ProdGate-compliant layout!
        let tier = if u >= 360 && true {
            "Stretch"
        } else if u >= 356 {
            "Tier-A"
        } else if u > 352 {
            "Tier-B"
        } else {
            "Baseline-Compliant"
        };

        if u > 352 {
            println!(">>> FOUND PRODGATE COMPLIANT: {} from {} with U={}! Evaluating CKT...", layout.id, seed_name, u);
            let candidate = evaluate_candidate(&ctx, layout, seed_name, tier)?;
            println!("    CKT: {:.6}, U: {}, M/D/V: {}/{}/{}, MX: {:.2}, rp_max: {:.4}, w_max: {:.4}",
                     candidate.ckt_v4, candidate.u, candidate.memory, candidate.displaced_initials, candidate.displaced_vowels,
                     candidate.ergonomics.mx_score, candidate.ergonomics.rp_max, candidate.ergonomics.w_max);
            candidates.push(candidate);
            return Ok(true);
        }

        Ok(false)
    };

    println!("\n=== EXPLORATION PHASE 1: Exhaustive 1-hop and 2-hop neighborhood of Production Top-3 ===");
    for seed in &all_seeds[..3] {
        let seed_id = seed.id.clone();
        println!("Expanding from production seed {}...", seed_id);

        // 1-hop final key swaps
        for i in 0..35 {
            for j in (i+1)..35 {
                if seed.final_keys[i] != seed.final_keys[j] {
                    let mut mut_l = seed.clone();
                    mut_l.final_keys.swap(i, j);
                    mut_l.id = format!("{}-f1h-{}_{}", seed_id, i, j);
                    check_candidate(&mut_l, &seed_id, &mut pareto_candidates, &mut evaluated_states)?;
                }
            }
        }

        // 1-hop head key swaps
        for i in 0..27 {
            for j in (i+1)..27 {
                if seed.head_keys[i] != seed.head_keys[j] {
                    let mut mut_l = seed.clone();
                    mut_l.head_keys.swap(i, j);
                    mut_l.id = format!("{}-h1h-{}_{}", seed_id, i, j);
                    check_candidate(&mut_l, &seed_id, &mut pareto_candidates, &mut evaluated_states)?;
                }
            }
        }
    }

    println!("\n=== EXPLORATION PHASE 2: Multi-Hop Local Beam Search (Targeting High U & Low CKT) ===");
    // If we have Tier-B or Tier-A candidates, expand from them!
    let mut current_pool = pareto_candidates.clone();
    for depth in 2..=4 {
        println!("Search depth {depth}: expanding from {} discovered compliant candidates...", current_pool.len());
        let mut next_pool = Vec::new();
        for base in &current_pool {
            let base_layout = RegularLayout {
                id: base.id.clone(),
                capacity: [21, 21],
                head_keys: base.head_keys.clone(),
                final_keys: base.final_keys.clone(),
                tone: base.tone,
            };

            // Explore final swaps
            for i in 0..35 {
                for j in (i+1)..35 {
                    if base_layout.final_keys[i] != base_layout.final_keys[j] {
                        let mut mut_l = base_layout.clone();
                        mut_l.final_keys.swap(i, j);
                        mut_l.id = format!("{}-d{}-f{}_{}", base.id, depth, i, j);
                        if check_candidate(&mut_l, &base.seed_source, &mut pareto_candidates, &mut evaluated_states)? {
                            next_pool.push(pareto_candidates.last().unwrap().clone());
                        }
                    }
                }
            }

            // Explore head swaps
            for i in 0..27 {
                for j in (i+1)..27 {
                    if base_layout.head_keys[i] != base_layout.head_keys[j] {
                        let mut mut_l = base_layout.clone();
                        mut_l.head_keys.swap(i, j);
                        mut_l.id = format!("{}-d{}-h{}_{}", base.id, depth, i, j);
                        if check_candidate(&mut_l, &base.seed_source, &mut pareto_candidates, &mut evaluated_states)? {
                            next_pool.push(pareto_candidates.last().unwrap().clone());
                        }
                    }
                }
            }
        }
        if next_pool.is_empty() {
            println!("No further improvements in depth {depth}.");
            break;
        }
        current_pool = next_pool;
    }

    println!("\n=== EXPLORATION PHASE 3: BCW Structural Surgery ===");
    // Target W: sh+e, P: i
    // In BCW: finals['e'] is on W (key 22), finals['i'] is on P (key 15).
    // Test moving e and i to candidate locations that preserve U and reduce loads.
    let e_idx = 5; // 'e'
    let i_idx = 10; // 'i'
    let mut bcw_surgeries = Vec::new();

    for seed in &all_seeds[3..] { // Basin 01 members
        let seed_id = seed.id.clone();
        for target_e in 0..35 {
            if target_e == e_idx { continue; }
            let mut l_e = seed.clone();
            l_e.final_keys.swap(e_idx, target_e);
            for target_i in 0..35 {
                if target_i == i_idx || target_i == target_e { continue; }
                let mut l_ei = l_e.clone();
                l_ei.final_keys.swap(i_idx, target_i);
                l_ei.id = format!("{}-surg-e{}_i{}", seed_id, target_e, target_i);
                
                let (u, _, _) = compute_u_and_collisions(&schemes.pinyin_map, &schemes.common_pinyin, &l_ei);
                if u >= 353 {
                    if let Ok(loads) = ergo_fixture.load_model.diagnose(&l_ei) {
                        if loads.w_max <= PRODGATE_MAX_W * 1.5 && loads.rp_max <= PRODGATE_MAX_RP * 1.5 {
                            bcw_surgeries.push((l_ei, u));
                        }
                    }
                }
            }
        }
    }
    println!("Generated {} viable BCW surgery candidates with U >= 353 and reduced W/P loads.", bcw_surgeries.len());
    for (layout, u) in bcw_surgeries.iter().take(200) {
        check_candidate(layout, "bcw-surgery", &mut pareto_candidates, &mut evaluated_states)?;
    }

    println!("\n=== RESULTS SUMMARY ===");
    println!("Total states evaluated: {}", evaluated_states.len());
    println!("Total ProdGate-compliant candidates with U > 352: {}", pareto_candidates.len());

    // Sort pareto candidates by CKT
    pareto_candidates.sort_by(|a, b| a.ckt_v4.partial_cmp(&b.ckt_v4).unwrap());

    // Save full JSON results
    let out_json_path = base_dir.join("research/exploration/prodgate-directed-repair-pareto-20261029.json");
    fs::create_dir_all(out_json_path.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::write(&out_json_path, serde_json::to_string_pretty(&pareto_candidates).unwrap()).map_err(|e| e.to_string())?;
    println!("Saved Pareto results to: {:?}", out_json_path);
    println!("Elapsed time: {:.2}s", t_start.elapsed().as_secs_f64());

    Ok(())
}
