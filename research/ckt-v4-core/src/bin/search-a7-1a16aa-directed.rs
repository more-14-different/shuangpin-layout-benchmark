use ckt_v4_core::{
    CognitiveParameters, ErgonomicFixture, IncrementalResolver, IncrementalSummary, InputMode,
    KeyAlphabet, NativeCorpus, ProjectedMotor, Projection, ProposalKind, RegularLayout, RoleTables,
    SchemeFixture, SchemeState, SearchRng, Summary, composite_score, layout_state_key, propose,
    resolve, summarize,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::Path;
use std::thread;
use std::time::{Duration, Instant};

const ALPHABET_CHARS: [char; 34] = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S',
    'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '[', ']', '\\', ';', '\'', ',', '.', '/',
];

const ALLOWED_PROPOSALS: [ProposalKind; 6] = [
    ProposalKind::FinalKeySwap,
    ProposalKind::FinalKeyReplacement,
    ProposalKind::FinalTokenMove,
    ProposalKind::FinalTokenSwap,
    ProposalKind::FinalPairRegroup,
    ProposalKind::FinalCycleRegroup,
];

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SeedJson {
    id: String,
    capacity: [u8; 2],
    head_keys: Vec<u8>,
    final_keys: Vec<u8>,
    tone: [u8; 5],
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Stage1Candidate {
    pub state_key: String,
    pub ckt_v4: f64,
    pub memory: usize,
    pub displaced_initials: usize,
    pub displaced_vowels: usize,
    pub qaz_peak: f64,
    pub p_peak: f64,
    pub max_finger_peak: f64,
    pub s2_home: f64,
    pub home_floor: f64,
    pub tyb_peak: f64,
    pub final_keys: Vec<u8>,
    pub seed_id: String,
    pub temperature: f64,
    pub iteration_found: usize,
}

struct ModeWorker {
    mode: InputMode,
    dependencies: ckt_v4_core::DependencyIndex,
    resolver: IncrementalResolver,
    summary: IncrementalSummary,
}

fn mode_summaries(modes: &[ModeWorker]) -> Vec<Summary> {
    modes.iter().map(|m| m.summary.summary()).collect()
}

fn score_full_modes(
    corpus: &NativeCorpus,
    scheme: &SchemeState,
    motor: &ProjectedMotor,
    parameters: CognitiveParameters,
) -> Result<Vec<Summary>, String> {
    [InputMode::Keytao, InputMode::Sanpin]
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

fn compute_loads_diagnostics(
    layout: &RegularLayout,
    masses: &[Vec<f64>],
    s2_idx: usize,
    c4_idx: usize,
    wx_idx: usize,
) -> (f64, f64, f64, f64, f64, f64) {
    let mapped: Vec<char> = layout
        .head_keys
        .iter()
        .chain(&layout.final_keys)
        .chain(&layout.tone)
        .map(|&idx| ALPHABET_CHARS[idx as usize])
        .collect();

    let finger_masks: [&str; 8] = [
        "QAZ", "WSX", "EDC", "RFVTGB", "YHNUJM", "IK,", "OL.", "P;/'[]\\",
    ];
    let home_keys = "ASDFGHJKL;";
    let tyb_keys = "TYB";
    let left_pinky_keys = "QAZ";
    let right_pinky_keys = "P;/'[]\\";

    let mut qaz_peak = f64::NEG_INFINITY;
    let mut p_peak = f64::NEG_INFINITY;
    let mut tyb_peak = f64::NEG_INFINITY;
    let mut max_finger_peak = f64::NEG_INFINITY;
    let mut s2_home: f64 = 0.0;
    let mut c4_home: f64 = 0.0;
    let mut wx_home: f64 = 0.0;

    for (row_idx, row) in masses.iter().enumerate() {
        let mut qaz = 0.0;
        let mut p = 0.0;
        let mut tyb = 0.0;
        let mut home = 0.0;
        let mut fingers = [0.0; 8];

        for (&mass, &ch) in row.iter().zip(&mapped) {
            if left_pinky_keys.contains(ch) {
                qaz += mass;
            }
            if right_pinky_keys.contains(ch) {
                p += mass;
            }
            if tyb_keys.contains(ch) {
                tyb += mass;
            }
            if home_keys.contains(ch) {
                home += mass;
            }
            for (f_idx, mask) in finger_masks.iter().enumerate() {
                if mask.contains(ch) {
                    fingers[f_idx] += mass;
                    break;
                }
            }
        }

        if qaz > qaz_peak {
            qaz_peak = qaz;
        }
        if p > p_peak {
            p_peak = p;
        }
        if tyb > tyb_peak {
            tyb_peak = tyb;
        }
        let row_max_f = fingers.into_iter().fold(f64::NEG_INFINITY, f64::max);
        if row_max_f > max_finger_peak {
            max_finger_peak = row_max_f;
        }

        if row_idx == s2_idx {
            s2_home = home;
        }
        if row_idx == c4_idx {
            c4_home = home;
        }
        if row_idx == wx_idx {
            wx_home = home;
        }
    }

    let home_floor = c4_home.min(wx_home);
    (
        qaz_peak,
        p_peak,
        max_finger_peak,
        s2_home,
        home_floor,
        tyb_peak,
    )
}

#[cfg(windows)]
fn set_low_process_priority() {
    unsafe extern "system" {
        fn GetCurrentProcess() -> *mut std::ffi::c_void;
        fn SetPriorityClass(process: *mut std::ffi::c_void, priority_class: u32) -> i32;
    }
    const BELOW_NORMAL_PRIORITY_CLASS: u32 = 0x0000_4000;
    unsafe {
        let handle = GetCurrentProcess();
        let res = SetPriorityClass(handle, BELOW_NORMAL_PRIORITY_CLASS);
        if res != 0 {
            println!("Process priority set to BelowNormal (low CPU priority).");
        }
    }
}

#[cfg(not(windows))]
fn set_low_process_priority() {}

fn main() -> Result<(), String> {
    set_low_process_priority();

    let args: Vec<String> = env::args().collect();
    // Default to gentle, long-term friendly parameters:
    // arg 1: steps_per_chain (default 400)
    // arg 2: duty_ms (default 30ms sleep per proposal to keep CPU cool and quiet)
    let steps_per_chain: usize = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(400);
    let duty_ms: u64 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(30);

    println!("========================================================");
    println!(" Directed Annealing: A7-1a16aa Pareto Basin Search      ");
    println!(" Mode: Gentle Background (Low CPU, Single Worker)       ");
    println!(" Steps Per Chain: {steps_per_chain}, Duty Sleep: {duty_ms}ms");
    println!("========================================================");

    let corpus_path = Path::new("research/.cache/ckt-v4-native-corpus.bin");
    let schemes_path = Path::new("research/.cache/ckt-v4-all-schemes.json");
    let snapshot_path = Path::new("tools/ckt_v4_upstream_role_tables.json");
    let ergo_path = Path::new("research/.cache/ckt-v4-ergonomics.json");
    let seeds_dir = Path::new("research/seeds/ckt-v4/a7-1a16aa-directed-20261108");
    let output_dir = Path::new("research/exploration/a7-1a16aa-directed-20261108");
    fs::create_dir_all(output_dir).map_err(|e| e.to_string())?;

    println!("Loading NativeCorpus...");
    let corpus = NativeCorpus::open(corpus_path)?;
    println!("Loading SchemeFixture...");
    let fixture = SchemeFixture::open(schemes_path)?;
    let alphabet = KeyAlphabet::new(&corpus.header().key_alphabet)?;

    println!("Loading ProjectedMotor snapshot...");
    let motor = load_motor(&corpus, &alphabet, snapshot_path)?;

    println!("Loading Ergonomics Fixture...");
    let ergo_fixture = ErgonomicFixture::open(ergo_path)?;
    let masses = ergo_fixture.load_model.masses;
    let s2_idx = ergo_fixture
        .load_model
        .tracks
        .iter()
        .position(|t| t == &ergo_fixture.load_model.track_roles.s2)
        .ok_or("s2 track missing")?;
    let c4_idx = ergo_fixture
        .load_model
        .tracks
        .iter()
        .position(|t| t == &ergo_fixture.load_model.track_roles.c4)
        .ok_or("c4 track missing")?;
    let wx_idx = ergo_fixture
        .load_model
        .tracks
        .iter()
        .position(|t| t == &ergo_fixture.load_model.track_roles.wx)
        .ok_or("wx track missing")?;

    // Precompute reference S005 summaries
    println!("Scoring Reference S005...");
    let s005_entry = fixture
        .schemes
        .iter()
        .find(|s| s.id == "S005")
        .ok_or("S005 missing from schemes")?;
    let parameters = CognitiveParameters::default();
    let s005_state = SchemeState::compile(s005_entry, &alphabet, corpus.header().pinyin_count)?;
    let ref_summaries = score_full_modes(&corpus, &s005_state, &motor, parameters)?;
    let s005_score = composite_score(&ref_summaries, &ref_summaries)?;
    println!("S005 reference score: {s005_score:.9} (strictly 10.000000000)");

    let idx_q = alphabet.index_of('Q').ok_or("Q missing")?;
    let idx_z = alphabet.index_of('Z').ok_or("Z missing")?;

    // Target heads: K=zh, L=sh, S=s+ch, P=p+k, l->E, k->P
    let target_head_keys: Vec<u8> = vec![
        1, 15, 12, 5, 3, 19, 13, 4, 6, 15, 7, 9, 16, 23, 10, 18, 11, 17, 25, 2, 18, 17, 2, 17, 22,
        24, 24,
    ];
    let tone_keys: [u8; 5] = [8, 21, 20, 0, 14]; // IVUAO

    let mut forbidden_on_z: Vec<usize> = Vec::new();
    let mut forbidden_on_q: Vec<usize> = Vec::new();

    for &p_idx in &fixture.common_pinyin {
        let [h_idx, f_idx] = fixture.pinyin_map[usize::from(p_idx)];
        if target_head_keys[usize::from(h_idx)] == idx_q {
            forbidden_on_z.push(usize::from(f_idx));
        }
        if target_head_keys[usize::from(h_idx)] == idx_z {
            forbidden_on_q.push(usize::from(f_idx));
        }
    }
    forbidden_on_z.sort_unstable();
    forbidden_on_z.dedup();
    forbidden_on_q.sort_unstable();
    forbidden_on_q.dedup();

    println!(
        "Common399 constraint: {} finals forbidden on key Z, {} finals forbidden on key Q",
        forbidden_on_z.len(),
        forbidden_on_q.len()
    );

    // Load seeds
    let mut seeds = Vec::new();
    let mut paths: Vec<_> = fs::read_dir(seeds_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.extension().is_some_and(|ext| ext == "json")
                && p.file_name().unwrap() != "manifest.json"
        })
        .collect();
    paths.sort();

    for path in paths {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let seed: SeedJson = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        seeds.push(seed);
    }
    println!("Loaded {} directed seeds in sorted order.", seeds.len());
    assert!(!seeds.is_empty(), "No seeds found!");

    // Construct chains plan:
    // Pair seeds with appropriate temperatures:
    // Center seeds (seed-01, seed-02) get full 4 temperatures: 0.003, 0.006, 0.012, 0.020
    // Endpoints (seed-03, 04, 05, 06) get 0.006, 0.012
    // Exact seeds (seed-07..10) get 0.006, 0.012
    let mut plan: Vec<(usize, f64)> = Vec::new();
    // Round 1: fine-tuning center & nearest neighbor at lowest temp
    plan.push((0, 0.003)); // 1a16aa fine-tune
    plan.push((1, 0.003)); // e8f37a fine-tune
    plan.push((0, 0.006));
    plan.push((1, 0.006));

    // Round 2: endpoint seeds at T=0.006
    for seed_idx in 2..seeds.len() {
        plan.push((seed_idx, 0.006));
    }

    // Round 3: bridge exploration at T=0.012
    for seed_idx in 0..seeds.len() {
        plan.push((seed_idx, 0.012));
    }

    // Round 4: escaping exploration at T=0.020
    plan.push((0, 0.020));
    plan.push((1, 0.020));
    plan.push((2, 0.020));
    plan.push((3, 0.020));

    println!("Total Planned Chains: {}", plan.len());

    let mut candidates_map: HashMap<String, Stage1Candidate> = HashMap::new();
    let stage1_json_path = output_dir.join("stage1_candidates.json");

    // Load existing candidates if present to accumulate results
    if stage1_json_path.exists() {
        if let Ok(content) = fs::read_to_string(&stage1_json_path) {
            if let Ok(existing) = serde_json::from_str::<Vec<Stage1Candidate>>(&content) {
                for c in existing {
                    candidates_map.insert(c.state_key.clone(), c);
                }
                println!(
                    "Loaded {} existing Stage 1 candidates from disk.",
                    candidates_map.len()
                );
            }
        }
    }

    let mut rng = SearchRng::new(0x2026_1108_abcd_1234);
    let start_time = Instant::now();

    for (chain_idx, &(seed_idx, temp)) in plan.iter().enumerate() {
        let seed = &seeds[seed_idx];
        println!(
            "\n>>> [Chain {:2}/{}] Seed: {:20} | Temp: {:.4} | Steps: {}",
            chain_idx + 1,
            plan.len(),
            seed.id,
            temp,
            steps_per_chain
        );

        let mut current_layout = RegularLayout {
            id: format!("directed-c{chain_idx}"),
            capacity: [21, 21],
            head_keys: target_head_keys.clone(),
            final_keys: seed.final_keys.clone(),
            tone: tone_keys,
        };

        let mut current_scheme = match fixture.scheme_state(&current_layout) {
            Ok(s) => s,
            Err(e) => {
                eprintln!(
                    "Warning: skipping invalid initial state for {}: {e}",
                    seed.id
                );
                continue;
            }
        };

        let mut modes: Vec<ModeWorker> = match [InputMode::Keytao, InputMode::Sanpin]
            .into_iter()
            .map(|mode| {
                let generated = corpus.generate(&current_scheme, mode)?;
                let outcomes =
                    resolve(&generated.rows, |code| motor.cost(code).map(|v| v.upper_ms))?;
                let inc_motor = motor.clone();
                let resolver =
                    IncrementalResolver::from_precomputed(generated.rows, outcomes, move |code| {
                        inc_motor.cost(code).map(|v| v.upper_ms)
                    })?;
                let summary =
                    IncrementalSummary::new(resolver.rows(), resolver.outcomes(), parameters)?;
                Ok(ModeWorker {
                    mode,
                    dependencies: generated.dependencies,
                    resolver,
                    summary,
                })
            })
            .collect::<Result<Vec<_>, String>>()
        {
            Ok(m) => m,
            Err(e) => {
                eprintln!("Error initializing modes: {e}");
                continue;
            }
        };

        let mut current_ckt = match composite_score(&mode_summaries(&modes), &ref_summaries) {
            Ok(score) => score,
            Err(e) => {
                eprintln!("Error computing initial composite score: {e}");
                continue;
            }
        };

        let mut accepted_count = 0;
        let mut new_candidates_in_chain = 0;

        for step in 0..steps_per_chain {
            // Gentle duty cycle sleep to ensure low CPU utilization
            if duty_ms > 0 {
                thread::sleep(Duration::from_millis(duty_ms));
            }

            let kind = ALLOWED_PROPOSALS[rng.index(ALLOWED_PROPOSALS.len())];

            let mut mutated_candidate = match propose(&current_layout, kind, &mut rng) {
                Ok(cand) => cand,
                Err(_) => continue,
            };

            mutated_candidate.head_keys = target_head_keys.clone();
            mutated_candidate.tone = tone_keys;
            mutated_candidate.capacity = [21, 21];

            // Fast QZ and ZQ hard constraint check (0 chords in Common399)
            let zq_violation = forbidden_on_q
                .iter()
                .any(|&f| mutated_candidate.final_keys[f] == idx_q);
            if zq_violation {
                continue;
            }
            let qz_violation = forbidden_on_z
                .iter()
                .any(|&f| mutated_candidate.final_keys[f] == idx_z);
            if qz_violation {
                continue;
            }

            // Check Common399 uniqueness (no syllable collisions)
            if mutated_candidate
                .validate_common399(&fixture.pinyin_map, &fixture.common_pinyin)
                .is_err()
            {
                continue;
            }

            // Check structure and M/D/V bounds
            if mutated_candidate.validate_structure().is_err() {
                continue;
            }
            let diagnostics =
                match mutated_candidate.diagnostics(&alphabet, &fixture.heads, &fixture.finals) {
                    Ok(d) => d,
                    Err(_) => continue,
                };
            if diagnostics.memory > 42 || diagnostics.displaced_vowels > 5 {
                continue;
            }

            let candidate_scheme = match fixture.scheme_state(&mutated_candidate) {
                Ok(s) => s,
                Err(_) => continue,
            };

            let affected_by_mode: Vec<Vec<usize>> = match modes
                .iter()
                .map(|m| {
                    m.dependencies
                        .affected_rows(&current_scheme, &candidate_scheme)
                })
                .collect::<Result<Vec<_>, _>>()
            {
                Ok(aff) => aff,
                Err(_) => continue,
            };

            let mut receipts = Vec::with_capacity(modes.len());
            let mut ok_apply = true;

            for (mode, affected) in modes.iter_mut().zip(&affected_by_mode) {
                let updates = match corpus.generate_updates(
                    &candidate_scheme,
                    mode.mode,
                    &mode.dependencies,
                    affected,
                ) {
                    Ok(u) => u,
                    Err(_) => {
                        ok_apply = false;
                        break;
                    }
                };
                let receipt = match mode.resolver.apply_updates(updates) {
                    Ok(r) => r,
                    Err(_) => {
                        ok_apply = false;
                        break;
                    }
                };
                if mode
                    .summary
                    .apply_changes(mode.resolver.rows(), receipt.outcome_changes())
                    .is_err()
                {
                    ok_apply = false;
                    break;
                }
                receipts.push(receipt);
            }

            if !ok_apply {
                for (mode, receipt) in modes.iter_mut().zip(receipts).rev() {
                    if let Ok(rollback) = mode.resolver.rollback(receipt) {
                        let _ = mode
                            .summary
                            .apply_changes(mode.resolver.rows(), rollback.outcome_changes());
                    }
                }
                continue;
            }

            let candidate_ckt = match composite_score(&mode_summaries(&modes), &ref_summaries) {
                Ok(score) => score,
                Err(_) => {
                    for (mode, receipt) in modes.iter_mut().zip(receipts).rev() {
                        if let Ok(rollback) = mode.resolver.rollback(receipt) {
                            let _ = mode
                                .summary
                                .apply_changes(mode.resolver.rows(), rollback.outcome_changes());
                        }
                    }
                    continue;
                }
            };

            // Stage 1 criteria screening:
            // CKT <= 9.6200
            if candidate_ckt <= 9.6200 {
                let (qaz, p, max_f, s2_home, home_floor, tyb) =
                    compute_loads_diagnostics(&mutated_candidate, &masses, s2_idx, c4_idx, wx_idx);

                // Stage 1 ergonomic filter:
                // QAZ <= 16.90%
                // P区 <= 4.80%
                // 最大单指 <= 26.80%
                // S2主键区 >= 53.5%
                // 主键区下限 >= 35.0%
                // TYB <= 14.30%
                if qaz <= 0.1690
                    && p <= 0.0480
                    && max_f <= 0.2680
                    && s2_home >= 0.5350
                    && home_floor >= 0.3500
                    && tyb <= 0.1430
                {
                    let state_key = layout_state_key(&mutated_candidate);
                    let candidate_rec = Stage1Candidate {
                        state_key: state_key.clone(),
                        ckt_v4: candidate_ckt,
                        memory: diagnostics.memory,
                        displaced_initials: diagnostics.displaced_initials,
                        displaced_vowels: diagnostics.displaced_vowels,
                        qaz_peak: qaz,
                        p_peak: p,
                        max_finger_peak: max_f,
                        s2_home,
                        home_floor,
                        tyb_peak: tyb,
                        final_keys: mutated_candidate.final_keys.clone(),
                        seed_id: seed.id.clone(),
                        temperature: temp,
                        iteration_found: step,
                    };
                    if !candidates_map.contains_key(&state_key)
                        || candidates_map[&state_key].ckt_v4 > candidate_ckt
                    {
                        println!(
                            "  [NEW CANDIDATE] Key: {} | CKT: {:.4} | P: {:.3}% | HF: {:.3}% | S2Home: {:.3}% | TYB: {:.3}%",
                            &state_key[..14],
                            candidate_ckt,
                            p * 100.0,
                            home_floor * 100.0,
                            s2_home * 100.0,
                            tyb * 100.0
                        );
                        candidates_map.insert(state_key, candidate_rec);
                        new_candidates_in_chain += 1;
                    }
                }
            }

            // Metropolis acceptance
            let delta = candidate_ckt - current_ckt;
            let accept = delta <= 0.0 || rng.unit() < (-delta / temp).exp();

            if accept {
                accepted_count += 1;
                current_ckt = candidate_ckt;
                current_layout = mutated_candidate;
                current_scheme = candidate_scheme;
            } else {
                // Rollback
                for (mode, receipt) in modes.iter_mut().zip(receipts).rev() {
                    let rollback = mode.resolver.rollback(receipt).unwrap();
                    mode.summary
                        .apply_changes(mode.resolver.rows(), rollback.outcome_changes())
                        .unwrap();
                }
            }

            if (step + 1) % 50 == 0 || step + 1 == steps_per_chain {
                println!(
                    "  Step {:4}/{} | curCKT={:.6} | acc={:.1}% | Stage1 Total={}",
                    step + 1,
                    steps_per_chain,
                    current_ckt,
                    accepted_count as f64 / (step + 1) as f64 * 100.0,
                    candidates_map.len()
                );
            }
        }

        // Save progress to disk after each chain
        let mut candidate_list: Vec<_> = candidates_map.values().cloned().collect();
        candidate_list.sort_by(|a, b| a.ckt_v4.total_cmp(&b.ckt_v4));
        let _ = fs::write(
            &stage1_json_path,
            serde_json::to_string_pretty(&candidate_list).unwrap_or_default(),
        );

        println!(
            "Chain {} complete. New candidates in this chain: {}, Cumulative total: {}",
            chain_idx + 1,
            new_candidates_in_chain,
            candidates_map.len()
        );
    }

    let elapsed = start_time.elapsed();
    let total_candidates = candidates_map.len();

    println!("\n========================================================");
    println!(" Annealing Complete in {:.2}s!", elapsed.as_secs_f64());
    println!(" Total Qualified Stage 1 Candidates: {}", total_candidates);
    println!("========================================================");

    let mut candidate_list: Vec<_> = candidates_map.values().cloned().collect();
    candidate_list.sort_by(|a, b| a.ckt_v4.total_cmp(&b.ckt_v4));

    fs::write(
        &stage1_json_path,
        serde_json::to_string_pretty(&candidate_list).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    println!("Wrote Stage 1 candidates to {}", stage1_json_path.display());

    println!("\nTop 15 Stage 1 Candidates by CKT:");
    println!(
        "-----------------------------------------------------------------------------------------------------"
    );
    println!(
        "StateKey       | CKT     | QAZ    | P区    | MaxF   | S2Home | HomeFloor | TYB    | M/D/V"
    );
    println!(
        "-----------------------------------------------------------------------------------------------------"
    );
    for cand in candidate_list.iter().take(15) {
        println!(
            "{:14} | {:.4}  | {:.3}% | {:.3}% | {:.3}% | {:.3}% | {:.3}%   | {:.3}% | {}/{}/{}",
            &cand.state_key[..14],
            cand.ckt_v4,
            cand.qaz_peak * 100.0,
            cand.p_peak * 100.0,
            cand.max_finger_peak * 100.0,
            cand.s2_home * 100.0,
            cand.home_floor * 100.0,
            cand.tyb_peak * 100.0,
            cand.memory,
            cand.displaced_initials,
            cand.displaced_vowels
        );
    }
    println!(
        "-----------------------------------------------------------------------------------------------------"
    );

    Ok(())
}
