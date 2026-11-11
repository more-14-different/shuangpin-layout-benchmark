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

const JOINT_ANNEAL_VERSION: &str = "ckt-v51-toned-2121-joint-anneal-v1";

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
    rhyme_keys: Vec<Vec<char>>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryEntry {
    step: usize,
    score: f64,
    #[serde(default)]
    d: usize,
    #[serde(default)]
    m_lower: usize,
    description: String,
}

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnchorCheckpoint {
    #[serde(default)]
    version: Option<String>,
    #[serde(default)]
    best_score: Option<f64>,
    #[serde(default)]
    current_score: Option<f64>,
    #[serde(default)]
    best_state: Option<AnnealState>,
    #[serde(default)]
    current_state: Option<AnnealState>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AnnealCheckpoint {
    version: String,
    #[serde(default)]
    layout_id: Option<String>,
    #[serde(default)]
    step: usize,
    #[serde(default)]
    total_steps: usize,
    #[serde(default)]
    max_d: usize,
    #[serde(default)]
    temperature: f64,
    #[serde(default)]
    current_score: f64,
    #[serde(default)]
    best_score: f64,
    #[serde(default)]
    base_score: f64,
    #[serde(default)]
    accepted: usize,
    #[serde(default)]
    evaluated: usize,
    #[serde(default)]
    elapsed_ms: f64,
    current_state: AnnealState,
    best_state: AnnealState,
    #[serde(default)]
    history: Vec<HistoryEntry>,
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
    state: &AnnealState,
    fixture: &TrialFixture,
    alphabet: &KeyAlphabet,
    tone_keys_by_tone: [u8; 5],
) -> Result<SchemeState, String> {
    let mut toned_codes = vec![[None; 5]; fixture.pinyin.len()];

    // 1. Assign first keys
    for (atom_idx, &key_char) in state.first_keys.iter().enumerate() {
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
        for (rhyme_idx, &key_char) in state.rhyme_keys[region_idx].iter().enumerate() {
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

fn calc_ordinary_d(state: &AnnealState, fixture: &TrialFixture) -> usize {
    fixture
        .atoms
        .iter()
        .enumerate()
        .filter(|(_, a)| a.initial.len() == 1 && a.initial != "_")
        .filter(|(i, a)| state.first_keys[*i] != a.baseline_key)
        .count()
}

fn calc_memory_metrics(state: &AnnealState, fixture: &TrialFixture) -> (usize, usize, usize) {
    let mut first_memory_delta = 0;
    for (i, atom) in fixture.atoms.iter().enumerate() {
        if state.first_keys[i] != atom.baseline_key {
            first_memory_delta += atom.move_memory_delta;
        }
    }
    let mut merge_lower = 0;
    for (region_idx, _region) in fixture.tone_regions.iter().enumerate() {
        let keys: BTreeSet<char> = state.rhyme_keys[region_idx].iter().copied().collect();
        merge_lower += fixture.rhyme_atoms.len().saturating_sub(keys.len());
    }
    let merge_delta = merge_lower as isize - fixture.baseline_tone_region_merge_lower as isize;
    let adjust = |baseline: usize| -> usize {
        if merge_delta >= 0 {
            baseline + first_memory_delta + merge_delta as usize
        } else {
            baseline + first_memory_delta - (-merge_delta) as usize
        }
    };
    (
        adjust(fixture.baseline_memory_lower),
        adjust(fixture.baseline_memory_guard),
        merge_lower,
    )
}

fn mutate_joint_state(
    current: &AnnealState,
    fixture: &TrialFixture,
    rng: &mut SimpleRng,
    max_d: usize,
) -> (AnnealState, String) {
    let mut next = current.clone();
    let roll = rng.next_f64();

    if roll < 0.40 {
        // Operator 1: Rhyme swap within a tone region (40%)
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
                "rhyme_swap {}:{}({}) <-> {}({})",
                fixture.tone_regions[region_idx].name,
                fixture.rhyme_atoms[rhyme_a].name,
                key_a,
                fixture.rhyme_atoms[rhyme_b].name,
                key_b
            ),
        )
    } else if roll < 0.65 {
        // Operator 2: Rhyme move within a tone region preserving exact capacity (25%)
        let region_idx = rng.gen_range(0, fixture.tone_regions.len());
        let rhyme_idx = rng.gen_range(0, fixture.rhyme_atoms.len());
        let region_keys: Vec<char> = fixture.tone_regions[region_idx].keys.chars().collect();
        let target_key = region_keys[rng.gen_range(0, region_keys.len())];
        let old_key = next.rhyme_keys[region_idx][rhyme_idx];
        next.rhyme_keys[region_idx][rhyme_idx] = target_key;

        let used_keys: BTreeSet<char> = next.rhyme_keys[region_idx].iter().copied().collect();
        if used_keys.len() < region_keys.len() {
            // fallback to swap
            next.rhyme_keys[region_idx][rhyme_idx] = old_key;
            let mut other = rng.gen_range(0, fixture.rhyme_atoms.len());
            while other == rhyme_idx {
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
    } else if roll < 0.85 {
        // Operator 3: Special onset & zero-onset perturbation (20%)
        let sound_keys: Vec<char> = fixture.sound_keys.chars().collect();
        let zh_idx = fixture.atoms.iter().position(|a| a.name == "zh").unwrap_or(25);
        let ch_idx = fixture.atoms.iter().position(|a| a.name == "ch").unwrap_or(2);
        let sh_idx = fixture.atoms.iter().position(|a| a.name == "sh").unwrap_or(16);
        let zero_w_idx = fixture.atoms.iter().position(|a| a.name == "zero-W").unwrap_or(23);
        let zero_y_idx = fixture.atoms.iter().position(|a| a.name == "zero-Y").unwrap_or(24);
        let zero_aeo_indices: Vec<usize> = fixture
            .atoms
            .iter()
            .enumerate()
            .filter(|(_, a)| a.name == "zero-A" || a.name == "zero-E" || a.name == "zero-O")
            .map(|(i, _)| i)
            .collect();

        let special_roll = rng.next_f64();
        if special_roll < 0.40 {
            // Move zh, ch, or sh
            let retroflex = [zh_idx, ch_idx, sh_idx];
            let pick = retroflex[rng.gen_range(0, retroflex.len())];
            let old_key = next.first_keys[pick];
            let target_key = sound_keys[rng.gen_range(0, sound_keys.len())];
            next.first_keys[pick] = target_key;
            (
                next,
                format!("special_first {}: {} -> {}", fixture.atoms[pick].name, old_key, target_key),
            )
        } else if special_roll < 0.70 {
            // Move zero-W or zero-Y
            let zero_wy = [zero_w_idx, zero_y_idx];
            let pick = zero_wy[rng.gen_range(0, zero_wy.len())];
            let old_key = next.first_keys[pick];
            let target_key = sound_keys[rng.gen_range(0, sound_keys.len())];
            next.first_keys[pick] = target_key;
            (
                next,
                format!("zero_first {}: {} -> {}", fixture.atoms[pick].name, old_key, target_key),
            )
        } else {
            // Move zero-A/E/O together
            let old_key = next.first_keys[zero_aeo_indices[0]];
            let target_key = sound_keys[rng.gen_range(0, sound_keys.len())];
            for &idx in &zero_aeo_indices {
                next.first_keys[idx] = target_key;
            }
            (
                next,
                format!("zero_first zero-A/E/O: {} -> {}", old_key, target_key),
            )
        }
    } else {
        // Operator 4: Ordinary onset perturbation under D <= max_d (15%)
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
                    format!("ordinary_displace {}: {} -> {}", fixture.atoms[pick].name, old_key, target_key),
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
                    format!("ordinary_displace {}: {} -> {}", fixture.atoms[pick].name, old_key, target_key),
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
                    format!("ordinary_mutate {}: {} -> {}", fixture.atoms[pick].name, old_key, target_key),
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
                    format!("ordinary_reset {}: {} -> {}", fixture.atoms[pick].name, old_key, fixture.atoms[pick].baseline_key),
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
                    format!("ordinary_mutate {}: {} -> {}", fixture.atoms[pick].name, old_key, target_key),
                )
            } else {
                let reset_pick = displaced[rng.gen_range(0, displaced.len())];
                next.first_keys[reset_pick] = fixture.atoms[reset_pick].baseline_key;
                let available: Vec<usize> = ordinary_indices
                    .iter()
                    .copied()
                    .filter(|&i| i != reset_pick && next.first_keys[i] == fixture.atoms[i].baseline_key)
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

struct Args {
    corpus: PathBuf,
    fixture: PathBuf,
    snapshot: PathBuf,
    anchor_checkpoint: PathBuf,
    output: PathBuf,
    checkpoint: PathBuf,
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
        anchor_checkpoint: PathBuf::from("research/.cache/ckt-v51-toned-ordinary-d1-anneal-checkpoint.json"),
        output: PathBuf::from("research/.cache/ckt-v51-toned-joint-stage1-result.json"),
        checkpoint: PathBuf::from("research/.cache/ckt-v51-toned-joint-stage1-checkpoint.json"),
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
            "--steps" => args.steps = next(&mut index)?.parse().map_err(|_| "invalid steps")?,
            "--duration-secs" => {
                args.duration_secs = next(&mut index)?.parse().map_err(|_| "invalid duration-secs")?
            }
            "--max-d" => args.max_d = next(&mut index)?.parse().map_err(|_| "invalid max-d")?,
            "--initial-temp" => {
                args.initial_temp = next(&mut index)?.parse().map_err(|_| "invalid initial-temp")?
            }
            "--final-temp" => {
                args.final_temp = next(&mut index)?.parse().map_err(|_| "invalid final-temp")?
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

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = parse_args().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    eprintln!("=========================================================================");
    eprintln!(" CKT v5.1 Joint Multimodal Annealing (Onset x Zero-Onset x Rhyme x 7:8:6)");
    eprintln!(" Corpus: {:?}", args.corpus);
    eprintln!(" Fixture: {:?}", args.fixture);
    eprintln!(" Snapshot: {:?}", args.snapshot);
    eprintln!(" Anchor Checkpoint: {:?}", args.anchor_checkpoint);
    eprintln!(" Target Steps: {}, Duration: {}s, Max D: {}, Duty ms: {}", args.steps, args.duration_secs, args.max_d, args.duty_ms);
    eprintln!(" Temp: {} -> {}, Seed: {}", args.initial_temp, args.final_temp, args.seed);
    eprintln!("=========================================================================");

    let corpus = NativeCorpus::open(&args.corpus)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    let fixture: TrialFixture = serde_json::from_str(&fs::read_to_string(&args.fixture)?)?;
    let alphabet = KeyAlphabet::new(&fixture.key_alphabet)?;
    let motor = projected_motor(&corpus, &alphabet, &args.snapshot)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    let tone_keys_by_tone = parse_five_keys(&fixture.tone_keys_by_tone, &alphabet)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    // Load initial state
    let (mut checkpoint, mut current_state) = if args.resume && args.checkpoint.exists() {
        let cp: AnnealCheckpoint = serde_json::from_str(&fs::read_to_string(&args.checkpoint)?)?;
        eprintln!(
            "Resuming from step {}/{} (elapsed {:.1}s) with curr={:.6}, best={:.6}",
            cp.step, cp.total_steps, cp.elapsed_ms / 1000.0, cp.current_score, cp.best_score
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
        let cur_d = calc_ordinary_d(&state, &fixture);
        let (cur_m_lower, _cur_m_guard, _merge_lower) = calc_memory_metrics(&state, &fixture);
        eprintln!(
            "Loaded anchor state: recorded score = {:.12}, current D = {} (max_d = {}), M_lower = {}",
            anchor_score, cur_d, args.max_d, cur_m_lower
        );
        let cp = AnnealCheckpoint {
            version: JOINT_ANNEAL_VERSION.to_owned(),
            layout_id: Some(fixture.layout_id.clone()),
            step: 0,
            total_steps: args.steps,
            max_d: args.max_d,
            temperature: args.initial_temp,
            current_score: anchor_score,
            best_score: anchor_score,
            base_score: anchor_score,
            accepted: 0,
            evaluated: 0,
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
        };
        (cp, state)
    };

    let mut current_scheme = build_scheme_state(&current_state, &fixture, &alphabet, tone_keys_by_tone)
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

    let verified_initial_score = normalized_score(&summary.summary(), &fixture.reference_effective_ms)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    eprintln!("Verified initial state CKT: {:.12}", verified_initial_score);
    checkpoint.current_score = verified_initial_score;
    if verified_initial_score < checkpoint.best_score {
        checkpoint.best_score = verified_initial_score;
    }

    let mars0_score = 9.556530457331402_f64;
    let mut rng = SimpleRng::new(args.seed + checkpoint.step as u64);
    let start_time = Instant::now();
    let base_elapsed_ms = checkpoint.elapsed_ms;

    while checkpoint.step < args.steps {
        let current_elapsed_ms = base_elapsed_ms + start_time.elapsed().as_secs_f64() * 1000.0;
        if args.duration_secs > 0 && current_elapsed_ms >= (args.duration_secs as f64 * 1000.0) {
            eprintln!("Target duration of {}s reached at step {}", args.duration_secs, checkpoint.step);
            break;
        }

        let (candidate_state, desc) = mutate_joint_state(&current_state, &fixture, &mut rng, args.max_d);

        let cand_scheme = build_scheme_state(&candidate_state, &fixture, &alphabet, tone_keys_by_tone)
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
            current_scheme = cand_scheme;

            if score < checkpoint.best_score {
                let drop = checkpoint.best_score - score;
                checkpoint.best_score = score;
                checkpoint.best_state = current_state.clone();
                let cur_d = calc_ordinary_d(&current_state, &fixture);
                let (cur_m, _, _) = calc_memory_metrics(&current_state, &fixture);
                eprintln!(
                    "  [★ NEW BEST] Step {:>5}/{} | CKT: {:.12} (drop: {:.6}, ΔMars0: {:+.6}) | D={}/{} M={} | T: {:.6} | {}",
                    checkpoint.step,
                    args.steps,
                    score,
                    drop,
                    score - mars0_score,
                    cur_d,
                    args.max_d,
                    cur_m,
                    checkpoint.temperature,
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
        checkpoint.temperature = args.initial_temp * (args.final_temp / args.initial_temp).powf(progress);

        if args.verify_every > 0 && checkpoint.evaluated % args.verify_every == 0 {
            resolver.verify_against_full_recompute()?;
        }

        if args.checkpoint_every > 0 && checkpoint.step % args.checkpoint_every == 0 {
            let mut cp_save = checkpoint.clone();
            cp_save.elapsed_ms = current_elapsed_ms;
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
                "  [Checkpoint] Step {:>5}/{} | Cur: {:.6} | Best: {:.12} (D={} M={}) | Acc: {:.1}% | T: {:.6}",
                checkpoint.step,
                args.steps,
                checkpoint.current_score,
                checkpoint.best_score,
                cur_d,
                cur_m,
                (checkpoint.accepted as f64 / checkpoint.evaluated as f64) * 100.0,
                checkpoint.temperature
            );
        }

        if args.duty_ms > 0 {
            thread::sleep(Duration::from_millis(args.duty_ms));
        }
    }

    checkpoint.elapsed_ms = base_elapsed_ms + start_time.elapsed().as_secs_f64() * 1000.0;
    if let Some(parent) = args.output.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(
        &args.output,
        serde_json::to_string_pretty(&checkpoint).map_err(|e| e.to_string())?,
    )?;

    let final_d = calc_ordinary_d(&checkpoint.best_state, &fixture);
    let (final_m, _, _) = calc_memory_metrics(&checkpoint.best_state, &fixture);
    eprintln!(
        "\nJoint Annealing completed in {:.2}s. Final Best CKT = {:.12} (D={} M={}, ΔBase: {:+.6}, ΔMars0: {:+.6})",
        checkpoint.elapsed_ms / 1000.0,
        checkpoint.best_score,
        final_d,
        final_m,
        checkpoint.best_score - checkpoint.base_score,
        checkpoint.best_score - mars0_score
    );
    eprintln!("Wrote final results to {:?}", args.output);

    Ok(())
}
