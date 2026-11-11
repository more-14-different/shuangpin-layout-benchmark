use ckt_v4_core::toned_bucket::*;
use ckt_v4_core::{
    CognitiveParameters, IncrementalResolver, IncrementalSummary, InputMode, KeyAlphabet, Kind,
    NativeCorpus, ProjectedMotor, Projection, RoleTables, Summary,
};
use serde::Deserialize;
use std::collections::{BTreeSet, HashMap};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};

struct SimpleRng {
    state: u64,
}

impl SimpleRng {
    fn new(seed: u64) -> Self {
        Self { state: seed.max(1) }
    }

    fn next_u64(&mut self) -> u64 {
        self.state ^= self.state << 13;
        self.state ^= self.state >> 7;
        self.state ^= self.state << 17;
        self.state
    }

    fn next_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / ((1_u64 << 53) as f64)
    }

    fn gen_range(&mut self, low: usize, high: usize) -> usize {
        assert!(low < high);
        low + (self.next_u64() as usize % (high - low))
    }
}

fn parse_five_keys(value: &str, alphabet: &KeyAlphabet) -> Result<[u8; 5], String> {
    let chars = value.chars().collect::<Vec<_>>();
    if chars.len() != 5 {
        return Err("expected five keys".to_owned());
    }
    let mut result = [0_u8; 5];
    for (index, ch) in chars.into_iter().enumerate() {
        result[index] = alphabet.index_of(ch).ok_or("key outside alphabet")? as u8;
    }
    Ok(result)
}

fn projected_motor(
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
        let global = alphabet
            .index_of(key.chars().next().ok_or("empty extension key")?)
            .ok_or("unknown extension key")?;
        let donors = extension
            .donors
            .iter()
            .map(|(donor, weight)| {
                alphabet
                    .index_of(donor.chars().next().ok_or("empty donor key")?)
                    .map(|index| (index, *weight))
                    .ok_or("unknown donor key".to_owned())
            })
            .collect::<Result<Vec<_>, _>>()?;
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

fn normalized_score(summary: &Summary, reference: &[f64; 4]) -> Result<f64, String> {
    let weights = [1.0_f64, 3.0, 1.0, 1.0];
    let mut total = 0.0;
    let mut weighted = 0.0;
    for kind in Kind::ALL {
        let value = summary
            .track(kind)
            .ok_or_else(|| format!("missing {kind:?}"))?
            .effective_ms;
        let weight = weights[kind.index()];
        weighted += weight * (value / reference[kind.index()]).powi(4);
        total += weight;
    }
    Ok(10.0 * (weighted / total).powf(0.25))
}

fn mutate_joint_state(
    current: &AnnealState,
    fixture: &TrialFixture,
    rng: &mut SimpleRng,
    max_d: usize,
    rhyme_only: bool,
) -> (AnnealState, String) {
    let mut next = current.clone();
    let roll = rng.next_f64();

    let op = if rhyme_only {
        if roll < 0.60 { 1 } else { 2 }
    } else if max_d == 0 {
        if roll < 0.45 {
            1
        } else if roll < 0.75 {
            2
        } else {
            3
        }
    } else {
        if roll < 0.40 {
            1
        } else if roll < 0.65 {
            2
        } else if roll < 0.85 {
            3
        } else {
            4
        }
    };

    match op {
        1 => {
            // Operator 1: Rhyme swap within a tone region (avoid same-key no-op)
            let region_idx = rng.gen_range(0, fixture.tone_regions.len());
            let rhyme_a = rng.gen_range(0, fixture.rhyme_atoms.len());
            let key_a = next.rhyme_keys[region_idx][rhyme_a];
            let mut rhyme_b = rng.gen_range(0, fixture.rhyme_atoms.len());
            for _ in 0..32 {
                if rhyme_b != rhyme_a && next.rhyme_keys[region_idx][rhyme_b] != key_a {
                    break;
                }
                rhyme_b = rng.gen_range(0, fixture.rhyme_atoms.len());
            }
            let key_b = next.rhyme_keys[region_idx][rhyme_b];
            next.rhyme_keys[region_idx][rhyme_a] = key_b;
            next.rhyme_keys[region_idx][rhyme_b] = key_a;
            (
                next,
                format!(
                    "rhyme_swap {}:{}({}) <-> {}({})",
                    fixture.tone_regions[region_idx].name,
                    fixture.rhyme_atoms[rhyme_a].name,
                    key_a,
                    fixture.rhyme_atoms[rhyme_b].name,
                    key_b
                ),
            )
        }
        2 => {
            // Operator 2: Rhyme move within a tone region preserving exact capacity
            let region_idx = rng.gen_range(0, fixture.tone_regions.len());
            let rhyme_idx = rng.gen_range(0, fixture.rhyme_atoms.len());
            let region_keys: Vec<char> = fixture.tone_regions[region_idx].keys.chars().collect();
            let old_key = next.rhyme_keys[region_idx][rhyme_idx];
            let mut target_key = region_keys[rng.gen_range(0, region_keys.len())];
            if region_keys.len() > 1 {
                for _ in 0..16 {
                    if target_key != old_key {
                        break;
                    }
                    target_key = region_keys[rng.gen_range(0, region_keys.len())];
                }
            }
            next.rhyme_keys[region_idx][rhyme_idx] = target_key;

            let used_keys: BTreeSet<char> = next.rhyme_keys[region_idx].iter().copied().collect();
            if used_keys.len() < region_keys.len() {
                // fallback to swap
                next.rhyme_keys[region_idx][rhyme_idx] = old_key;
                let mut other = rng.gen_range(0, fixture.rhyme_atoms.len());
                for _ in 0..32 {
                    if other != rhyme_idx && next.rhyme_keys[region_idx][other] != old_key {
                        break;
                    }
                    other = rng.gen_range(0, fixture.rhyme_atoms.len());
                }
                let key_other = next.rhyme_keys[region_idx][other];
                next.rhyme_keys[region_idx][rhyme_idx] = key_other;
                next.rhyme_keys[region_idx][other] = old_key;
                (
                    next,
                    format!(
                        "rhyme_swap {}:{}({}) <-> {}({})",
                        fixture.tone_regions[region_idx].name,
                        fixture.rhyme_atoms[rhyme_idx].name,
                        old_key,
                        fixture.rhyme_atoms[other].name,
                        key_other
                    ),
                )
            } else {
                (
                    next,
                    format!(
                        "rhyme_move {}:{}: {} -> {}",
                        fixture.tone_regions[region_idx].name,
                        fixture.rhyme_atoms[rhyme_idx].name,
                        old_key,
                        target_key
                    ),
                )
            }
        }
        3 => {
            // Operator 3: Special onset & zero-onset perturbation (independent 8 families)
            let sound_keys: Vec<char> = fixture.sound_keys.chars().collect();
            let pick_atom_name = &fixture.searchable_first_atoms
                [rng.gen_range(0, fixture.searchable_first_atoms.len())];
            let pick = fixture
                .atoms
                .iter()
                .position(|a| &a.name == pick_atom_name)
                .expect("searchable atom found");
            let old_key = next.first_keys[pick];
            let mut target_key = sound_keys[rng.gen_range(0, sound_keys.len())];
            while target_key == old_key {
                target_key = sound_keys[rng.gen_range(0, sound_keys.len())];
            }
            next.first_keys[pick] = target_key;
            (
                next,
                format!(
                    "special_first {}: {} -> {}",
                    fixture.atoms[pick].name, old_key, target_key
                ),
            )
        }
        _ => {
            // Operator 4: Ordinary onset perturbation under D <= max_d
            let sound_keys: Vec<char> = fixture.sound_keys.chars().collect();
            let ordinary_indices: Vec<usize> = fixture
                .atoms
                .iter()
                .enumerate()
                .filter(|(_, a)| a.initial.len() == 1 && a.initial != "_")
                .map(|(i, _)| i)
                .collect();

            let displaced: Vec<usize> = ordinary_indices
                .iter()
                .copied()
                .filter(|&i| next.first_keys[i] != fixture.atoms[i].baseline_key)
                .collect();

            if displaced.is_empty() {
                if max_d > 0 {
                    let pick = ordinary_indices[rng.gen_range(0, ordinary_indices.len())];
                    let old_key = next.first_keys[pick];
                    let mut target_key = sound_keys[rng.gen_range(0, sound_keys.len())];
                    while target_key == old_key {
                        target_key = sound_keys[rng.gen_range(0, sound_keys.len())];
                    }
                    next.first_keys[pick] = target_key;
                    (
                        next,
                        format!(
                            "ordinary_displace {}: {} -> {}",
                            fixture.atoms[pick].name, old_key, target_key
                        ),
                    )
                } else {
                    (next, "noop".to_owned())
                }
            } else if displaced.len() < max_d {
                let sub_roll = rng.next_f64();
                if sub_roll < 0.50 {
                    let available: Vec<usize> = ordinary_indices
                        .iter()
                        .copied()
                        .filter(|&i| next.first_keys[i] == fixture.atoms[i].baseline_key)
                        .collect();
                    let pick = available[rng.gen_range(0, available.len())];
                    let old_key = next.first_keys[pick];
                    let mut target_key = sound_keys[rng.gen_range(0, sound_keys.len())];
                    while target_key == old_key {
                        target_key = sound_keys[rng.gen_range(0, sound_keys.len())];
                    }
                    next.first_keys[pick] = target_key;
                    (
                        next,
                        format!(
                            "ordinary_displace {}: {} -> {}",
                            fixture.atoms[pick].name, old_key, target_key
                        ),
                    )
                } else {
                    let pick = displaced[rng.gen_range(0, displaced.len())];
                    let old_key = next.first_keys[pick];
                    let mut target_key = sound_keys[rng.gen_range(0, sound_keys.len())];
                    while target_key == old_key {
                        target_key = sound_keys[rng.gen_range(0, sound_keys.len())];
                    }
                    next.first_keys[pick] = target_key;
                    (
                        next,
                        format!(
                            "ordinary_mutate {}: {} -> {}",
                            fixture.atoms[pick].name, old_key, target_key
                        ),
                    )
                }
            } else {
                // displaced.len() == max_d
                let sub_roll = rng.next_f64();
                if sub_roll < 0.35 {
                    let pick = displaced[rng.gen_range(0, displaced.len())];
                    let old_key = next.first_keys[pick];
                    next.first_keys[pick] = fixture.atoms[pick].baseline_key;
                    (
                        next,
                        format!(
                            "ordinary_reset {}: {} -> {}",
                            fixture.atoms[pick].name, old_key, fixture.atoms[pick].baseline_key
                        ),
                    )
                } else if sub_roll < 0.70 {
                    let pick = displaced[rng.gen_range(0, displaced.len())];
                    let old_key = next.first_keys[pick];
                    let mut target_key = sound_keys[rng.gen_range(0, sound_keys.len())];
                    while target_key == old_key {
                        target_key = sound_keys[rng.gen_range(0, sound_keys.len())];
                    }
                    next.first_keys[pick] = target_key;
                    (
                        next,
                        format!(
                            "ordinary_mutate {}: {} -> {}",
                            fixture.atoms[pick].name, old_key, target_key
                        ),
                    )
                } else {
                    let reset_pick = displaced[rng.gen_range(0, displaced.len())];
                    next.first_keys[reset_pick] = fixture.atoms[reset_pick].baseline_key;
                    let available: Vec<usize> = ordinary_indices
                        .iter()
                        .copied()
                        .filter(|&i| {
                            i != reset_pick && next.first_keys[i] == fixture.atoms[i].baseline_key
                        })
                        .collect();
                    let new_pick = available[rng.gen_range(0, available.len())];
                    let mut target_key = sound_keys[rng.gen_range(0, sound_keys.len())];
                    while target_key == fixture.atoms[new_pick].baseline_key {
                        target_key = sound_keys[rng.gen_range(0, sound_keys.len())];
                    }
                    next.first_keys[new_pick] = target_key;
                    (
                        next,
                        format!(
                            "ordinary_shift_ticket: {} reset to {}, {} -> {}",
                            fixture.atoms[reset_pick].name,
                            fixture.atoms[reset_pick].baseline_key,
                            fixture.atoms[new_pick].name,
                            target_key
                        ),
                    )
                }
            }
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SeedsInventory {
    #[serde(default)]
    audit_token_keys: Vec<String>,
}

struct Args {
    corpus: PathBuf,
    fixture: PathBuf,
    snapshot: PathBuf,
    anchor_checkpoint: PathBuf,
    output: PathBuf,
    checkpoint: PathBuf,
    seeds_json: PathBuf,
    steps: usize,
    duration_secs: u64,
    max_d: usize,
    initial_temp: f64,
    final_temp: f64,
    checkpoint_every: usize,
    verify_every: usize,
    duty_ms: u64,
    resume: bool,
    seed: u64,
    require_empty_buckets: Vec<String>,
    rhyme_only: bool,
}

fn parse_args() -> Result<Args, String> {
    let values = env::args().skip(1).collect::<Vec<_>>();
    if values.len() < 3 {
        return Err("usage: anneal-joint-toned-full CORPUS FIXTURE SNAPSHOT [options]".to_owned());
    }
    let mut args = Args {
        corpus: PathBuf::from(&values[0]),
        fixture: PathBuf::from(&values[1]),
        snapshot: PathBuf::from(&values[2]),
        anchor_checkpoint: PathBuf::from(
            "research/.cache/ckt-v51-toned-ordinary-d1-anneal-checkpoint.json",
        ),
        output: PathBuf::from("research/.cache/ckt-v51-toned-joint-stage1-result.json"),
        checkpoint: PathBuf::from("research/.cache/ckt-v51-toned-joint-stage1-checkpoint.json"),
        seeds_json: PathBuf::from("research/config/ckt-v51-toned-2121-seeds.json"),
        steps: 5000,
        duration_secs: 0,
        max_d: 1,
        initial_temp: 0.020,
        final_temp: 0.00005,
        checkpoint_every: 50,
        verify_every: 250,
        duty_ms: 5,
        resume: false,
        seed: 1410786,
        require_empty_buckets: Vec::new(),
        rhyme_only: false,
    };
    let mut index = 3;
    while index < values.len() {
        let value = &values[index];
        let next = |at: &mut usize| -> Result<&str, String> {
            *at += 1;
            values
                .get(*at)
                .map(String::as_str)
                .ok_or_else(|| format!("{value} needs a value"))
        };
        match value.as_str() {
            "--anchor" => args.anchor_checkpoint = PathBuf::from(next(&mut index)?),
            "--output" => args.output = PathBuf::from(next(&mut index)?),
            "--checkpoint" => args.checkpoint = PathBuf::from(next(&mut index)?),
            "--seeds-json" => args.seeds_json = PathBuf::from(next(&mut index)?),
            "--steps" => args.steps = next(&mut index)?.parse().map_err(|_| "invalid steps")?,
            "--duration-secs" => {
                args.duration_secs = next(&mut index)?
                    .parse()
                    .map_err(|_| "invalid duration-secs")?
            }
            "--max-d" => args.max_d = next(&mut index)?.parse().map_err(|_| "invalid max-d")?,
            "--initial-temp" => {
                args.initial_temp = next(&mut index)?
                    .parse()
                    .map_err(|_| "invalid initial-temp")?
            }
            "--final-temp" => {
                args.final_temp = next(&mut index)?
                    .parse()
                    .map_err(|_| "invalid final-temp")?
            }
            "--checkpoint-every" => {
                args.checkpoint_every = next(&mut index)?
                    .parse()
                    .map_err(|_| "invalid checkpoint-every")?
            }
            "--verify-every" => {
                args.verify_every = next(&mut index)?
                    .parse()
                    .map_err(|_| "invalid verify-every")?
            }
            "--duty-ms" => {
                args.duty_ms = next(&mut index)?.parse().map_err(|_| "invalid duty-ms")?
            }
            "--seed" => args.seed = next(&mut index)?.parse().map_err(|_| "invalid seed")?,
            "--resume" => args.resume = true,
            "--rhyme-only" => args.rhyme_only = true,
            "--require-empty-buckets" => {
                let raw = next(&mut index)?;
                args.require_empty_buckets = raw
                    .split(',')
                    .map(|s| s.trim().to_ascii_uppercase())
                    .filter(|s| !s.is_empty())
                    .collect();
            }
            _ => return Err(format!("unknown option {value}")),
        }
        index += 1;
    }
    Ok(args)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = parse_args().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    eprintln!("=========================================================================");
    eprintln!(" CKT v5.1 Joint Multimodal Annealing (Onset x Zero-Onset x Rhyme x 7:8:6)");
    eprintln!(" Corpus: {:?}", args.corpus);
    eprintln!(" Fixture: {:?}", args.fixture);
    eprintln!(" Snapshot: {:?}", args.snapshot);
    eprintln!(" Anchor Checkpoint: {:?}", args.anchor_checkpoint);
    eprintln!(
        " Target Steps: {}, Duration: {}s, Max D: {}, Duty ms: {}, Rhyme Only: {}",
        args.steps, args.duration_secs, args.max_d, args.duty_ms, args.rhyme_only
    );
    eprintln!(
        " Temp: {} -> {}, Seed: {}, Require Empty Buckets: {:?}",
        args.initial_temp, args.final_temp, args.seed, args.require_empty_buckets
    );
    eprintln!("=========================================================================");

    let corpus = NativeCorpus::open(&args.corpus)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    let fixture: TrialFixture = serde_json::from_str(&fs::read_to_string(&args.fixture)?)?;
    let alphabet = KeyAlphabet::new(&fixture.key_alphabet)?;
    let motor = projected_motor(&corpus, &alphabet, &args.snapshot)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    let tone_keys_by_tone = parse_five_keys(&fixture.tone_keys_by_tone, &alphabet)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    let forbidden_pairs = parse_forbidden_buckets(&args.require_empty_buckets, &fixture.sound_keys)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    let audit_tokens: Option<BTreeSet<String>> = if args.seeds_json.exists() {
        let content = fs::read_to_string(&args.seeds_json)?;
        let inventory: SeedsInventory = serde_json::from_str(&content)?;
        Some(inventory.audit_token_keys.into_iter().collect())
    } else {
        None
    };

    let validator = BucketValidator::from_fixture(&fixture, audit_tokens.as_ref())
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    // Load initial state
    let (mut checkpoint, mut current_state) = if args.resume && args.checkpoint.exists() {
        let cp: AnnealCheckpoint = serde_json::from_str(&fs::read_to_string(&args.checkpoint)?)?;
        cp.validate_resume_contract(
            &fixture.layout_id,
            &fixture.source_hashes,
            &args.require_empty_buckets,
            args.max_d,
        )
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        let violations = validator.find_forbidden_violations(&cp.current_state, &forbidden_pairs);
        if !violations.is_empty() {
            let details = violations
                .iter()
                .map(|(b, s)| format!("{b}={s}"))
                .collect::<Vec<_>>()
                .join(", ");
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("resume checkpoint violates forbidden empty buckets: {details}"),
            )
            .into());
        }

        eprintln!(
            "Resuming from step {}/{} (elapsed {:.1}s) with curr={:.6}, best={:.6}",
            cp.step,
            cp.total_steps,
            cp.elapsed_ms / 1000.0,
            cp.current_score,
            cp.best_score
        );
        let state = cp.current_state.clone();
        (cp, state)
    } else {
        let anchor_raw = fs::read_to_string(&args.anchor_checkpoint)?;
        let anchor: AnchorCheckpoint = serde_json::from_str(&anchor_raw)?;
        let state = anchor
            .best_state
            .or(anchor.current_state)
            .ok_or("no state found in anchor checkpoint")?;
        let anchor_score = anchor
            .best_score
            .or(anchor.current_score)
            .unwrap_or(9.999999);

        let violations = validator.find_forbidden_violations(&state, &forbidden_pairs);
        if !violations.is_empty() {
            let details = violations
                .iter()
                .map(|(b, s)| format!("{b}={s}"))
                .collect::<Vec<_>>()
                .join(", ");
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("initial/anchor state violates required empty buckets: {details}"),
            )
            .into());
        }

        let cur_d = calc_ordinary_d(&state, &fixture);
        let (cur_m_lower, _cur_m_guard, _merge_lower) = calc_memory_metrics(&state, &fixture);
        eprintln!(
            "Loaded anchor state: recorded score = {:.12}, current D = {} (max_d = {}), M_lower = {}",
            anchor_score, cur_d, args.max_d, cur_m_lower
        );
        let cp = AnnealCheckpoint {
            version: JOINT_ANNEAL_VERSION.to_owned(),
            fixture_id: Some(fixture.layout_id.clone()),
            layout_id: Some(fixture.layout_id.clone()),
            source_hashes: fixture.source_hashes.clone(),
            require_empty_buckets: args.require_empty_buckets.clone(),
            max_d: args.max_d,
            rhyme_only: args.rhyme_only,
            step: 0,
            total_steps: args.steps,
            temperature: args.initial_temp,
            current_score: anchor_score,
            best_score: anchor_score,
            base_score: anchor_score,
            accepted: 0,
            evaluated: 0,
            rejected_forbidden: 0,
            elapsed_ms: 0.0,
            current_state: state.clone(),
            best_state: state.clone(),
            history: vec![HistoryEntry {
                step: 0,
                score: anchor_score,
                d: cur_d,
                m_lower: cur_m_lower,
                description: format!("Anchor baseline (D={cur_d}, M={cur_m_lower})"),
            }],
            diagnostics: None,
            pareto_frontier: Vec::new(),
        };
        (cp, state)
    };

    let mut current_scheme =
        build_scheme_state(&current_state, &fixture, &alphabet, tone_keys_by_tone)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    let generated = corpus
        .generate(&current_scheme, InputMode::KeytaoV51)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    let parameters = CognitiveParameters {
        page_size: 6,
        selection_action_ms: 0.0,
        ..CognitiveParameters::default()
    };
    let motor_for_resolver = motor.clone();
    let mut resolver = IncrementalResolver::new(generated.rows, move |code| {
        motor_for_resolver.cost(code).map(|value| value.upper_ms)
    })
    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    let mut summary = IncrementalSummary::new(resolver.rows(), resolver.outcomes(), parameters)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    let verified_initial_score =
        normalized_score(&summary.summary(), &fixture.reference_effective_ms)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    eprintln!("Verified initial state CKT: {:.12}", verified_initial_score);
    checkpoint.current_score = verified_initial_score;
    if verified_initial_score < checkpoint.best_score {
        checkpoint.best_score = verified_initial_score;
    }
    {
        let init_d = calc_ordinary_d(&current_state, &fixture);
        let (init_m_lower, init_m_guard, init_merge_lower) =
            calc_memory_metrics(&current_state, &fixture);
        let (init_first_moves, _, init_rhyme_moves) = calc_move_metrics(&current_state, &fixture);
        update_pareto_frontier(
            &mut checkpoint.pareto_frontier,
            ParetoEntry {
                score: verified_initial_score,
                ordinary_d: init_d,
                memory_lower: init_m_lower,
                memory_guard: init_m_guard,
                merge_lower: init_merge_lower,
                first_group_moves: init_first_moves,
                rhyme_group_moves: init_rhyme_moves,
                rhyme_internal_splits: 0,
                step: checkpoint.step,
                description: "Initial state".to_owned(),
                state: current_state.clone(),
                diagnostics: None,
            },
        );
    }

    let mars0_score = 9.556530457331402_f64;
    let mut rng = SimpleRng::new(args.seed + checkpoint.step as u64);
    let start_time = Instant::now();
    let base_elapsed_ms = checkpoint.elapsed_ms;

    while checkpoint.step < args.steps {
        let current_elapsed_ms = base_elapsed_ms + start_time.elapsed().as_secs_f64() * 1000.0;
        if args.duration_secs > 0 && current_elapsed_ms >= (args.duration_secs as f64 * 1000.0) {
            eprintln!(
                "Target duration of {}s reached at step {}",
                args.duration_secs, checkpoint.step
            );
            break;
        }

        let (candidate_state, desc) = mutate_joint_state(
            &current_state,
            &fixture,
            &mut rng,
            args.max_d,
            args.rhyme_only,
        );

        // Pre-scoring rejection of proposals violating empty bucket constraints
        if !validator.is_valid_forbidden(&candidate_state, &forbidden_pairs) {
            checkpoint.rejected_forbidden += 1;
            continue;
        }

        let cand_scheme =
            build_scheme_state(&candidate_state, &fixture, &alphabet, tone_keys_by_tone)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        let direct = generated
            .dependencies
            .affected_rows(&current_scheme, &cand_scheme)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        let updates = corpus
            .generate_updates(
                &cand_scheme,
                InputMode::KeytaoV51,
                &generated.dependencies,
                &direct,
            )
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        let receipt = resolver
            .apply_updates(updates)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        summary
            .apply_changes(resolver.rows(), receipt.outcome_changes())
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        let score = normalized_score(&summary.summary(), &fixture.reference_effective_ms)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        checkpoint.evaluated += 1;

        let cand_d = calc_ordinary_d(&candidate_state, &fixture);
        let (cand_m_lower, cand_m_guard, cand_merge_lower) =
            calc_memory_metrics(&candidate_state, &fixture);
        let (cand_first_moves, _, cand_rhyme_moves) = calc_move_metrics(&candidate_state, &fixture);
        if update_pareto_frontier(
            &mut checkpoint.pareto_frontier,
            ParetoEntry {
                score,
                ordinary_d: cand_d,
                memory_lower: cand_m_lower,
                memory_guard: cand_m_guard,
                merge_lower: cand_merge_lower,
                first_group_moves: cand_first_moves,
                rhyme_group_moves: cand_rhyme_moves,
                rhyme_internal_splits: 0,
                step: checkpoint.step,
                description: desc.clone(),
                state: candidate_state.clone(),
                diagnostics: None,
            },
        ) {
            eprintln!(
                "  [◆ PARETO] Step {:>5}/{} | CKT: {:.12} | D={} M={}/{} (size={}) | {}",
                checkpoint.step,
                args.steps,
                score,
                cand_d,
                cand_m_lower,
                cand_m_guard,
                checkpoint.pareto_frontier.len(),
                desc
            );
        }

        let delta = score - checkpoint.current_score;
        let accept = if delta <= 0.0 {
            true
        } else {
            let p = (-delta / checkpoint.temperature).exp();
            rng.next_f64() < p
        };

        if accept {
            checkpoint.accepted += 1;
            checkpoint.current_score = score;
            current_state = candidate_state;
            current_scheme = cand_scheme;

            if score < checkpoint.best_score - 1e-12 {
                let drop = checkpoint.best_score - score;
                checkpoint.best_score = score;
                checkpoint.best_state = current_state.clone();
                let cur_d = calc_ordinary_d(&current_state, &fixture);
                let (cur_m, _, _) = calc_memory_metrics(&current_state, &fixture);
                eprintln!(
                    "  [★ NEW BEST] Step {:>5}/{} | CKT: {:.12} (drop: {:.6}, ΔMars0: {:+.6}) | D={}/{} M={} | T: {:.6} | rej_forbid: {} | {}",
                    checkpoint.step,
                    args.steps,
                    score,
                    drop,
                    score - mars0_score,
                    cur_d,
                    args.max_d,
                    cur_m,
                    checkpoint.temperature,
                    checkpoint.rejected_forbidden,
                    desc
                );
                checkpoint.history.push(HistoryEntry {
                    step: checkpoint.step,
                    score,
                    d: cur_d,
                    m_lower: cur_m,
                    description: desc,
                });
            }
        } else {
            let rollback = resolver
                .rollback(receipt)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
            summary
                .apply_changes(resolver.rows(), rollback.outcome_changes())
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        }

        checkpoint.step += 1;
        checkpoint.current_state = current_state.clone();

        // Update temperature
        let progress = if args.duration_secs > 0 {
            let time_prog = current_elapsed_ms / (args.duration_secs as f64 * 1000.0);
            let step_prog = checkpoint.step as f64 / args.steps as f64;
            time_prog.max(step_prog).min(1.0)
        } else {
            (checkpoint.step as f64 / args.steps as f64).min(1.0)
        };
        checkpoint.temperature =
            args.initial_temp * (args.final_temp / args.initial_temp).powf(progress);

        if args.verify_every > 0 && checkpoint.evaluated % args.verify_every == 0 {
            resolver.verify_against_full_recompute()?;
        }

        if args.checkpoint_every > 0 && checkpoint.step % args.checkpoint_every == 0 {
            let mut cp_save = checkpoint.clone();
            cp_save.elapsed_ms = current_elapsed_ms;
            cp_save.diagnostics =
                Some(validator.compute_diagnostics(&checkpoint.best_state, &fixture));
            if let Some(parent) = args.checkpoint.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(
                &args.checkpoint,
                serde_json::to_string_pretty(&cp_save).map_err(|e| e.to_string())?,
            )?;
            let cur_d = calc_ordinary_d(&checkpoint.best_state, &fixture);
            let (cur_m, _, _) = calc_memory_metrics(&checkpoint.best_state, &fixture);
            eprintln!(
                "  [Checkpoint] Step {:>5}/{} | Cur: {:.6} | Best: {:.12} (D={} M={}) | Acc: {:.1}% | T: {:.6} | Rej: {}",
                checkpoint.step,
                args.steps,
                checkpoint.current_score,
                checkpoint.best_score,
                cur_d,
                cur_m,
                (checkpoint.accepted as f64 / checkpoint.evaluated.max(1) as f64) * 100.0,
                checkpoint.temperature,
                checkpoint.rejected_forbidden
            );
        }

        if args.duty_ms > 0 {
            thread::sleep(Duration::from_millis(args.duty_ms));
        }
    }

    checkpoint.elapsed_ms = base_elapsed_ms + start_time.elapsed().as_secs_f64() * 1000.0;
    checkpoint.diagnostics = Some(validator.compute_diagnostics(&checkpoint.best_state, &fixture));
    for entry in &mut checkpoint.pareto_frontier {
        entry.diagnostics = Some(validator.compute_diagnostics(&entry.state, &fixture));
    }
    if let Some(parent) = args.output.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(
        &args.output,
        serde_json::to_string_pretty(&checkpoint).map_err(|e| e.to_string())?,
    )?;

    let final_d = calc_ordinary_d(&checkpoint.best_state, &fixture);
    let (final_m, _, _) = calc_memory_metrics(&checkpoint.best_state, &fixture);
    let diag = checkpoint.diagnostics.as_ref().unwrap();
    eprintln!(
        "\nJoint Annealing completed in {:.2}s. Final Best CKT = {:.12} (D={} M={}, ΔBase: {:+.6}, ΔMars0: {:+.6})",
        checkpoint.elapsed_ms / 1000.0,
        checkpoint.best_score,
        final_d,
        final_m,
        checkpoint.best_score - checkpoint.base_score,
        checkpoint.best_score - mars0_score
    );
    eprintln!(
        "Occupied Buckets: 1407 -> {}/441 (empty: {}), Common1237 -> {}/441 (empty: {}), QZ empty: {}",
        diag.layout1407_occupied_buckets,
        diag.layout1407_empty_buckets_count,
        diag.common1237_occupied_buckets,
        diag.common1237_empty_buckets_count,
        diag.qz_empty
    );
    eprintln!(
        "Rejected forbidden proposals: {}",
        checkpoint.rejected_forbidden
    );
    eprintln!("Wrote final results to {:?}", args.output);

    Ok(())
}
