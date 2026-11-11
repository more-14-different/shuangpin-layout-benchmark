use ckt_v4_core::{
    CognitiveParameters, IncrementalResolver, IncrementalSummary, InputMode, KeyAlphabet, Kind,
    NativeCorpus, ProjectedMotor, Projection, RoleTables, SchemeState, Summary,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};

const ANNEAL_VERSION: &str = "ckt-v51-toned-2121-anneal-mars10-1";

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrialFixture {
    version: String,
    layout_id: String,
    key_alphabet: String,
    tone_keys_by_tone: String,
    sound_keys: String,
    baseline_memory_lower: usize,
    baseline_memory_guard: usize,
    baseline_tone_region_merge_lower: usize,
    expected: Expected,
    reference_effective_ms: [f64; 4],
    pinyin: Vec<String>,
    toned_codes: Vec<[Option<String>; 5]>,
    atoms: Vec<Atom>,
    searchable_first_atoms: Vec<String>,
    rhyme_atoms: Vec<RhymeAtom>,
    tone_regions: Vec<ToneRegion>,
}

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Expected {
    score: f64,
}

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Atom {
    name: String,
    initial: String,
    baseline_key: char,
    move_memory_delta: usize,
    pinyin: Vec<usize>,
}

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RhymeAtom {
    name: String,
    pinyin: Vec<usize>,
    baseline_keys: BTreeMap<String, char>,
}

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToneRegion {
    name: String,
    keys: String,
    tones: Vec<u8>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AnnealState {
    first_keys: Vec<char>,
    // rhyme_keys[region_idx][rhyme_idx] = key_char
    rhyme_keys: Vec<Vec<char>>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AnnealCheckpoint {
    version: String,
    layout_id: String,
    step: usize,
    total_steps: usize,
    temperature: f64,
    current_score: f64,
    best_score: f64,
    accepted: usize,
    evaluated: usize,
    elapsed_ms: f64,
    current_state: AnnealState,
    best_state: AnnealState,
    history: Vec<HistoryEntry>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryEntry {
    step: usize,
    score: f64,
    description: String,
}

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

#[allow(dead_code)]
fn parse_pair(value: &str, alphabet: &KeyAlphabet) -> Result<[u8; 2], String> {
    let mut chars = value.chars();
    let first = chars.next().ok_or("empty pair")?;
    let second = chars.next().ok_or("incomplete pair")?;
    if chars.next().is_some() {
        return Err("pair exceeds two keys".to_owned());
    }
    Ok([
        alphabet
            .index_of(first)
            .ok_or("first key outside alphabet")? as u8,
        alphabet
            .index_of(second)
            .ok_or("second key outside alphabet")? as u8,
    ])
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

fn build_scheme_state(
    anneal: &AnnealState,
    fixture: &TrialFixture,
    alphabet: &KeyAlphabet,
    tone_keys_by_tone: [u8; 5],
) -> Result<SchemeState, String> {
    let mut toned_codes = vec![[None; 5]; fixture.pinyin.len()];

    // 1. Assign first keys
    for (atom_idx, &key_char) in anneal.first_keys.iter().enumerate() {
        let key_u8 = alphabet.index_of(key_char).ok_or("invalid first key")? as u8;
        let atom = &fixture.atoms[atom_idx];
        for &py in &atom.pinyin {
            for t in 0..5 {
                if fixture.toned_codes[py][t].is_some() {
                    let mut pair = toned_codes[py][t].unwrap_or([0, 0]);
                    pair[0] = key_u8;
                    toned_codes[py][t] = Some(pair);
                }
            }
        }
    }

    // 2. Assign second keys from rhyme groups across tone regions
    for (region_idx, region) in fixture.tone_regions.iter().enumerate() {
        for (rhyme_idx, &key_char) in anneal.rhyme_keys[region_idx].iter().enumerate() {
            let key_u8 = alphabet.index_of(key_char).ok_or("invalid rhyme key")? as u8;
            let rhyme_atom = &fixture.rhyme_atoms[rhyme_idx];
            for &py in &rhyme_atom.pinyin {
                for &tone in &region.tones {
                    let t_idx = (tone - 1) as usize;
                    if fixture.toned_codes[py][t_idx].is_some() {
                        let mut pair = toned_codes[py][t_idx].unwrap_or([0, 0]);
                        pair[1] = key_u8;
                        toned_codes[py][t_idx] = Some(pair);
                    }
                }
            }
        }
    }

    SchemeState::from_toned_codes(&fixture.layout_id, [21, 21], toned_codes, tone_keys_by_tone)
}

fn mutate_state(
    current: &AnnealState,
    fixture: &TrialFixture,
    rng: &mut SimpleRng,
) -> (AnnealState, String) {
    let mut next = current.clone();
    let roll = rng.next_f64();

    if roll < 0.60 {
        // Proposal 1: Rhyme swap within a region (strictly preserves mergeLower & M)
        let region_idx = rng.gen_range(0, fixture.tone_regions.len());
        let rhyme_a = rng.gen_range(0, fixture.rhyme_atoms.len());
        let mut rhyme_b = rng.gen_range(0, fixture.rhyme_atoms.len());
        while rhyme_a == rhyme_b {
            rhyme_b = rng.gen_range(0, fixture.rhyme_atoms.len());
        }
        let key_a = next.rhyme_keys[region_idx][rhyme_a];
        let key_b = next.rhyme_keys[region_idx][rhyme_b];
        next.rhyme_keys[region_idx][rhyme_a] = key_b;
        next.rhyme_keys[region_idx][rhyme_b] = key_a;
        (
            next,
            format!(
                "swap {}:{}({}) <-> {}({})",
                fixture.tone_regions[region_idx].name,
                fixture.rhyme_atoms[rhyme_a].name,
                key_a,
                fixture.rhyme_atoms[rhyme_b].name,
                key_b
            ),
        )
    } else if roll < 0.90 {
        // Proposal 2: Rhyme move within a region
        let region_idx = rng.gen_range(0, fixture.tone_regions.len());
        let rhyme_idx = rng.gen_range(0, fixture.rhyme_atoms.len());
        let region_keys: Vec<char> = fixture.tone_regions[region_idx].keys.chars().collect();
        let target_key = region_keys[rng.gen_range(0, region_keys.len())];
        let old_key = next.rhyme_keys[region_idx][rhyme_idx];
        next.rhyme_keys[region_idx][rhyme_idx] = target_key;

        // Check if all region keys are still covered (preserving toneRegionMergeLower = 9)
        let used_keys: BTreeSet<char> = next.rhyme_keys[region_idx].iter().copied().collect();
        if used_keys.len() < region_keys.len() {
            // Revert if it increases mergeLower
            next.rhyme_keys[region_idx][rhyme_idx] = old_key;
            // Fallback to swap
            let mut other_rhyme = rng.gen_range(0, fixture.rhyme_atoms.len());
            while other_rhyme == rhyme_idx {
                other_rhyme = rng.gen_range(0, fixture.rhyme_atoms.len());
            }
            let key_other = next.rhyme_keys[region_idx][other_rhyme];
            next.rhyme_keys[region_idx][rhyme_idx] = key_other;
            next.rhyme_keys[region_idx][other_rhyme] = old_key;
            (
                next,
                format!(
                    "swap {}:{}({}) <-> {}({})",
                    fixture.tone_regions[region_idx].name,
                    fixture.rhyme_atoms[rhyme_idx].name,
                    old_key,
                    fixture.rhyme_atoms[other_rhyme].name,
                    key_other
                ),
            )
        } else {
            (
                next,
                format!(
                    "move {}:{}: {} -> {}",
                    fixture.tone_regions[region_idx].name,
                    fixture.rhyme_atoms[rhyme_idx].name,
                    old_key,
                    target_key
                ),
            )
        }
    } else {
        // Proposal 3: Double swap across two distinct regions
        let r1 = rng.gen_range(0, fixture.tone_regions.len());
        let mut r2 = rng.gen_range(0, fixture.tone_regions.len());
        while r1 == r2 {
            r2 = rng.gen_range(0, fixture.tone_regions.len());
        }
        let a1 = rng.gen_range(0, fixture.rhyme_atoms.len());
        let mut b1 = rng.gen_range(0, fixture.rhyme_atoms.len());
        while a1 == b1 {
            b1 = rng.gen_range(0, fixture.rhyme_atoms.len());
        }
        let a2 = rng.gen_range(0, fixture.rhyme_atoms.len());
        let mut b2 = rng.gen_range(0, fixture.rhyme_atoms.len());
        while a2 == b2 {
            b2 = rng.gen_range(0, fixture.rhyme_atoms.len());
        }

        let k_a1 = next.rhyme_keys[r1][a1];
        let k_b1 = next.rhyme_keys[r1][b1];
        next.rhyme_keys[r1][a1] = k_b1;
        next.rhyme_keys[r1][b1] = k_a1;

        let k_a2 = next.rhyme_keys[r2][a2];
        let k_b2 = next.rhyme_keys[r2][b2];
        next.rhyme_keys[r2][a2] = k_b2;
        next.rhyme_keys[r2][b2] = k_a2;

        (
            next,
            format!(
                "double-swap [{}:{}-{}] and [{}:{}-{}]",
                fixture.tone_regions[r1].name,
                fixture.rhyme_atoms[a1].name,
                fixture.rhyme_atoms[b1].name,
                fixture.tone_regions[r2].name,
                fixture.rhyme_atoms[a2].name,
                fixture.rhyme_atoms[b2].name
            ),
        )
    }
}

struct Args {
    corpus: PathBuf,
    fixture: PathBuf,
    snapshot: PathBuf,
    output: PathBuf,
    checkpoint: PathBuf,
    steps: usize,
    initial_temp: f64,
    final_temp: f64,
    checkpoint_every: usize,
    verify_every: usize,
    duty_ms: u64,
    resume: bool,
    seed: u64,
}

fn parse_args() -> Result<Args, String> {
    let values = env::args().skip(1).collect::<Vec<_>>();
    if values.len() < 3 {
        return Err("usage: anneal-toned-mars10 CORPUS FIXTURE SNAPSHOT [options]".to_owned());
    }
    let mut args = Args {
        corpus: PathBuf::from(&values[0]),
        fixture: PathBuf::from(&values[1]),
        snapshot: PathBuf::from(&values[2]),
        output: PathBuf::from("research/.cache/ckt-v51-toned-mars10-anneal-result.json"),
        checkpoint: PathBuf::from("research/.cache/ckt-v51-toned-mars10-anneal-checkpoint.json"),
        steps: 5000,
        initial_temp: 0.02,
        final_temp: 0.0001,
        checkpoint_every: 50,
        verify_every: 250,
        duty_ms: 5,
        resume: false,
        seed: 1410786,
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
            "--output" => args.output = PathBuf::from(next(&mut index)?),
            "--checkpoint" => args.checkpoint = PathBuf::from(next(&mut index)?),
            "--steps" => args.steps = next(&mut index)?.parse().map_err(|_| "invalid steps")?,
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
            _ => return Err(format!("unknown option {value}")),
        }
        index += 1;
    }
    Ok(args)
}

fn main() -> Result<(), String> {
    let args = parse_args()?;
    let fixture: TrialFixture =
        serde_json::from_str(&fs::read_to_string(&args.fixture).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;

    let corpus = NativeCorpus::open(&args.corpus)?;
    let alphabet = KeyAlphabet::new(&fixture.key_alphabet)?;
    let tone_keys_by_tone = parse_five_keys(&fixture.tone_keys_by_tone, &alphabet)?;

    // Initial state from fixture:
    // First keys from fixture.atoms:
    let first_keys: Vec<char> = fixture.atoms.iter().map(|a| a.baseline_key).collect();
    // Rhyme keys from fixture.rhyme_atoms:
    let mut rhyme_keys = Vec::new();
    for region in &fixture.tone_regions {
        let mut keys_in_region = Vec::new();
        for rhyme in &fixture.rhyme_atoms {
            keys_in_region.push(rhyme.baseline_keys[&region.name]);
        }
        rhyme_keys.push(keys_in_region);
    }

    // Apply the 4th hop champion move: upper: i-er -> R (if not already in fixture)
    let upper_reg_idx = fixture
        .tone_regions
        .iter()
        .position(|r| r.name == "upper")
        .unwrap();
    let i_er_idx = fixture
        .rhyme_atoms
        .iter()
        .position(|r| r.name == "i-er")
        .unwrap();
    rhyme_keys[upper_reg_idx][i_er_idx] = 'R';

    let initial_anneal_state = AnnealState {
        first_keys,
        rhyme_keys,
    };

    let mut current_state = initial_anneal_state.clone();

    let initial_scheme =
        build_scheme_state(&current_state, &fixture, &alphabet, tone_keys_by_tone)?;

    let motor = projected_motor(&corpus, &alphabet, &args.snapshot)?;
    let generated = corpus.generate(&initial_scheme, InputMode::KeytaoV51)?;
    let parameters = CognitiveParameters {
        page_size: 6,
        selection_action_ms: 0.0,
        ..CognitiveParameters::default()
    };
    let motor_for_resolver = motor.clone();
    let mut resolver = IncrementalResolver::new(generated.rows, move |code| {
        motor_for_resolver.cost(code).map(|value| value.upper_ms)
    })?;
    let mut summary = IncrementalSummary::new(resolver.rows(), resolver.outcomes(), parameters)?;
    let initial_score = normalized_score(&summary.summary(), &fixture.reference_effective_ms)?;

    eprintln!(
        "=========================================================================\n\
         Simulated Annealing on 7:8:6 Rhyme Partition Space (Space 1)\n\
         Starting 4-Hop Champion Baseline CKT: {:.12}\n\
         Target Steps: {}, Initial T: {}, Final T: {}, Seed: {}\n\
         =========================================================================",
        initial_score, args.steps, args.initial_temp, args.final_temp, args.seed
    );

    let mut rng = SimpleRng::new(args.seed);

    let mut checkpoint = if args.resume && args.checkpoint.exists() {
        let cp: AnnealCheckpoint =
            serde_json::from_str(&fs::read_to_string(&args.checkpoint).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        eprintln!(
            "Resuming from step {}/{} with current_score={:.6}, best_score={:.6}",
            cp.step, cp.total_steps, cp.current_score, cp.best_score
        );
        current_state = cp.current_state.clone();
        cp
    } else {
        AnnealCheckpoint {
            version: ANNEAL_VERSION.to_owned(),
            layout_id: fixture.layout_id.clone(),
            step: 0,
            total_steps: args.steps,
            temperature: args.initial_temp,
            current_score: initial_score,
            best_score: initial_score,
            accepted: 0,
            evaluated: 0,
            elapsed_ms: 0.0,
            current_state: current_state.clone(),
            best_state: current_state.clone(),
            history: vec![HistoryEntry {
                step: 0,
                score: initial_score,
                description: "4-hop champion baseline".to_owned(),
            }],
        }
    };

    let start_time = Instant::now();
    let mut current_scheme =
        build_scheme_state(&current_state, &fixture, &alphabet, tone_keys_by_tone)?;

    let cooling_factor = (args.final_temp / args.initial_temp).powf(1.0 / args.steps as f64);

    while checkpoint.step < args.steps {
        let (candidate_state, desc) = mutate_state(&current_state, &fixture, &mut rng);
        let candidate_scheme =
            build_scheme_state(&candidate_state, &fixture, &alphabet, tone_keys_by_tone)?;

        let direct = generated
            .dependencies
            .affected_rows(&current_scheme, &candidate_scheme)?;
        let updates = corpus.generate_updates(
            &candidate_scheme,
            InputMode::KeytaoV51,
            &generated.dependencies,
            &direct,
        )?;
        let receipt = resolver.apply_updates(updates)?;
        summary.apply_changes(resolver.rows(), receipt.outcome_changes())?;
        let score = normalized_score(&summary.summary(), &fixture.reference_effective_ms)?;

        let delta = score - checkpoint.current_score;
        let accept = if delta <= 0.0 {
            true
        } else {
            let p = (-delta / checkpoint.temperature).exp();
            rng.next_f64() < p
        };

        checkpoint.evaluated += 1;

        if accept {
            checkpoint.accepted += 1;
            checkpoint.current_score = score;
            current_state = candidate_state;
            current_scheme = candidate_scheme;

            if score < checkpoint.best_score {
                let drop = checkpoint.best_score - score;
                checkpoint.best_score = score;
                checkpoint.best_state = current_state.clone();
                checkpoint.history.push(HistoryEntry {
                    step: checkpoint.step,
                    score,
                    description: desc.clone(),
                });
                eprintln!(
                    "  [★ NEW BEST] Step {:>5} | CKT: {:.12} (Δ={:+.6}, drop={:.6}) | T: {:.5} | {}",
                    checkpoint.step,
                    score,
                    score - initial_score,
                    drop,
                    checkpoint.temperature,
                    desc
                );
            }
        } else {
            let rollback = resolver.rollback(receipt)?;
            summary.apply_changes(resolver.rows(), rollback.outcome_changes())?;
        }

        checkpoint.step += 1;
        checkpoint.temperature *= cooling_factor;
        checkpoint.current_state = current_state.clone();

        if args.verify_every > 0 && checkpoint.evaluated % args.verify_every == 0 {
            resolver.verify_against_full_recompute()?;
        }

        if args.checkpoint_every > 0 && checkpoint.step % args.checkpoint_every == 0 {
            checkpoint.elapsed_ms += start_time.elapsed().as_secs_f64() * 1000.0;
            if let Some(parent) = args.checkpoint.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::write(
                &args.checkpoint,
                serde_json::to_vec_pretty(&checkpoint).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
            eprintln!(
                "  [Checkpoint] Step {:>5}/{} | Cur: {:.6} | Best: {:.6} | Acc: {:.1}% | T: {:.5}",
                checkpoint.step,
                args.steps,
                checkpoint.current_score,
                checkpoint.best_score,
                (checkpoint.accepted as f64 / checkpoint.evaluated as f64) * 100.0,
                checkpoint.temperature
            );
        }

        if args.duty_ms > 0 {
            thread::sleep(Duration::from_millis(args.duty_ms));
        }
    }

    checkpoint.elapsed_ms += start_time.elapsed().as_secs_f64() * 1000.0;
    fs::write(
        &args.checkpoint,
        serde_json::to_vec_pretty(&checkpoint).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    fs::write(
        &args.output,
        serde_json::to_vec_pretty(&checkpoint).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    eprintln!(
        "=========================================================================\n\
         Annealing Complete!\n\
         Total Evaluated: {}, Accepted: {} ({:.1}%)\n\
         Starting CKT: {:.12}\n\
         Final Best CKT: {:.12} (Δ={:+.6})\n\
         Elapsed: {:.2}s\n\
         =========================================================================",
        checkpoint.evaluated,
        checkpoint.accepted,
        (checkpoint.accepted as f64 / checkpoint.evaluated as f64) * 100.0,
        initial_score,
        checkpoint.best_score,
        checkpoint.best_score - initial_score,
        checkpoint.elapsed_ms / 1000.0
    );

    Ok(())
}
