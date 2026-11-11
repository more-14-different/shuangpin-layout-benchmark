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

const AUDIT_VERSION: &str = "ckt-v51-toned-2121-ordinary-d1-v1";

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

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnnealCheckpoint {
    version: String,
    #[serde(default)]
    layout_id: Option<String>,
    best_score: f64,
    best_state: AnnealState,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CandidateResult {
    rank: usize,
    initial: String,
    from_key: char,
    to_key: char,
    score: f64,
    delta_anchor: f64,
    delta_mars0: f64,
    m_lower: usize,
    m_guard: usize,
    d: usize,
    f: usize,
    splits: usize,
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

fn mutate_rhyme_state(
    current: &AnnealState,
    fixture: &TrialFixture,
    rng: &mut SimpleRng,
) -> (AnnealState, String) {
    let mut next = current.clone();
    let roll = rng.next_f64();

    if roll < 0.60 {
        // Swap within region
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
        // Move within region preserving full key coverage
        let region_idx = rng.gen_range(0, fixture.tone_regions.len());
        let rhyme_idx = rng.gen_range(0, fixture.rhyme_atoms.len());
        let region_keys: Vec<char> = fixture.tone_regions[region_idx].keys.chars().collect();
        let target_key = region_keys[rng.gen_range(0, region_keys.len())];
        let old_key = next.rhyme_keys[region_idx][rhyme_idx];
        next.rhyme_keys[region_idx][rhyme_idx] = target_key;

        let used_keys: BTreeSet<char> = next.rhyme_keys[region_idx].iter().copied().collect();
        if used_keys.len() < region_keys.len() {
            // fallback swap
            next.rhyme_keys[region_idx][rhyme_idx] = old_key;
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
        // Double swap across two distinct regions
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
                "double_swap {}:{}({})<->{}({}) & {}:{}({})<->{}({})",
                fixture.tone_regions[r1].name,
                fixture.rhyme_atoms[a1].name,
                k_a1,
                fixture.rhyme_atoms[b1].name,
                k_b1,
                fixture.tone_regions[r2].name,
                fixture.rhyme_atoms[a2].name,
                k_a2,
                fixture.rhyme_atoms[b2].name,
                k_b2
            ),
        )
    }
}

struct Args {
    corpus: PathBuf,
    fixture: PathBuf,
    snapshot: PathBuf,
    anchor_checkpoint: PathBuf,
    output: PathBuf,
    duty_ms: u64,
    anneal_steps: usize,
    anneal_checkpoint: PathBuf,
    anneal_output: PathBuf,
    start_d1: Option<String>,
}

fn parse_args() -> Result<Args, String> {
    let values = env::args().skip(1).collect::<Vec<_>>();
    if values.len() < 3 {
        return Err("usage: audit-toned-ordinary-d1 CORPUS FIXTURE SNAPSHOT [options]".to_owned());
    }
    let mut args = Args {
        corpus: PathBuf::from(&values[0]),
        fixture: PathBuf::from(&values[1]),
        snapshot: PathBuf::from(&values[2]),
        anchor_checkpoint: PathBuf::from(
            "research/.cache/ckt-v51-toned-mars10-anneal-checkpoint.json",
        ),
        output: PathBuf::from("research/.cache/ckt-v51-toned-ordinary-d1-results.json"),
        duty_ms: 5,
        anneal_steps: 0,
        anneal_checkpoint: PathBuf::from(
            "research/.cache/ckt-v51-toned-ordinary-d1-anneal-checkpoint.json",
        ),
        anneal_output: PathBuf::from(
            "research/.cache/ckt-v51-toned-ordinary-d1-anneal-result.json",
        ),
        start_d1: None,
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
            "--duty-ms" => {
                args.duty_ms = next(&mut index)?.parse().map_err(|_| "invalid duty-ms")?
            }
            "--anneal-steps" => {
                args.anneal_steps = next(&mut index)?
                    .parse()
                    .map_err(|_| "invalid anneal-steps")?
            }
            "--anneal-checkpoint" => args.anneal_checkpoint = PathBuf::from(next(&mut index)?),
            "--anneal-output" => args.anneal_output = PathBuf::from(next(&mut index)?),
            "--start-d1" => args.start_d1 = Some(next(&mut index)?.to_owned()),
            _ => return Err(format!("unknown option {value}")),
        }
        index += 1;
    }
    Ok(args)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = parse_args().map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    eprintln!("=== CKT v5.1 Ordinary Consonant D=1 Relaxation & Long-term Exploration ===");
    eprintln!("Corpus: {:?}", args.corpus);
    eprintln!("Fixture: {:?}", args.fixture);
    eprintln!("Role tables: {:?}", args.snapshot);
    eprintln!("Anchor checkpoint: {:?}", args.anchor_checkpoint);
    eprintln!("Duty ms: {}", args.duty_ms);
    eprintln!("Anneal steps: {}", args.anneal_steps);

    let corpus = NativeCorpus::open(&args.corpus)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    let fixture: TrialFixture = serde_json::from_str(&fs::read_to_string(&args.fixture)?)?;
    let alphabet = KeyAlphabet::new(&fixture.key_alphabet)?;
    let motor = projected_motor(&corpus, &alphabet, &args.snapshot)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    let tone_keys_by_tone = parse_five_keys(&fixture.tone_keys_by_tone, &alphabet)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    // Load anchor checkpoint
    let anchor_checkpoint: AnnealCheckpoint =
        serde_json::from_str(&fs::read_to_string(&args.anchor_checkpoint)?)?;
    let anchor_state = anchor_checkpoint.best_state;
    let anchor_scheme = build_scheme_state(&anchor_state, &fixture, &alphabet, tone_keys_by_tone)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    let generated = corpus
        .generate(&anchor_scheme, InputMode::KeytaoV51)
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

    let anchor_score = normalized_score(&summary.summary(), &fixture.reference_effective_ms)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    eprintln!(
        "Anchor state loaded: CKT = {:.12} (checkpoint recorded: {:.12})",
        anchor_score, anchor_checkpoint.best_score
    );

    let mars0_score = 9.556530457331402_f64;

    // Collect 18 ordinary atoms
    let ordinary_atoms: Vec<(usize, &Atom)> = fixture
        .atoms
        .iter()
        .enumerate()
        .filter(|(_, a)| a.initial.len() == 1 && a.initial != "_")
        .collect();

    if ordinary_atoms.len() != 18 {
        return Err(format!("expected 18 ordinary atoms, found {}", ordinary_atoms.len()).into());
    }

    eprintln!(
        "Identified 18 ordinary initials: {}",
        ordinary_atoms
            .iter()
            .map(|(_, a)| a.name.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    );

    let (best_1hop, _candidates) = if let Some(ref spec) = args.start_d1 {
        let parts: Vec<&str> = spec.split(':').collect();
        if parts.len() != 2 {
            return Err("expected --start-d1 initial:KEY (e.g. p:K)".into());
        }
        let init_name = parts[0];
        let target_char = parts[1].chars().next().ok_or("empty target key")?;
        let (atom_idx, atom) = ordinary_atoms
            .iter()
            .find(|(_, a)| a.name == init_name)
            .ok_or_else(|| format!("unknown ordinary initial {init_name}"))?;
        let from_key = atom.baseline_key;

        let mut candidate_state = anchor_state.clone();
        candidate_state.first_keys[*atom_idx] = target_char;
        let cand_scheme =
            build_scheme_state(&candidate_state, &fixture, &alphabet, tone_keys_by_tone)?;
        let d1_gen = corpus.generate(&cand_scheme, InputMode::KeytaoV51)?;
        let motor_eval = motor.clone();
        let d1_res = IncrementalResolver::new(d1_gen.rows, move |code| {
            motor_eval.cost(code).map(|v| v.upper_ms)
        })?;
        let d1_sum = IncrementalSummary::new(d1_res.rows(), d1_res.outcomes(), parameters)?;
        let score = normalized_score(&d1_sum.summary(), &fixture.reference_effective_ms)?;

        eprintln!(
            "Using explicit D=1 starting initial: {} -> {} | CKT: {:.12} (ΔAnchor: {:+.6}, ΔMars0: {:+.6})",
            init_name,
            target_char,
            score,
            score - anchor_score,
            score - mars0_score
        );

        let cand = CandidateResult {
            rank: 1,
            initial: init_name.to_owned(),
            from_key,
            to_key: target_char,
            score,
            delta_anchor: score - anchor_score,
            delta_mars0: score - mars0_score,
            m_lower: 21,
            m_guard: 23,
            d: 1,
            f: 0,
            splits: 0,
        };
        (cand.clone(), vec![cand])
    } else {
        let sound_keys: Vec<char> = fixture.sound_keys.chars().collect();
        let total_candidates = ordinary_atoms.len() * (sound_keys.len() - 1);
        eprintln!(
            "Evaluating all {} single-hop D=1 candidates (18 initials x 20 target keys)...",
            total_candidates
        );

        let start_time = Instant::now();
        let mut candidates: Vec<CandidateResult> = Vec::with_capacity(total_candidates);

        let current_anchor_scheme = anchor_scheme.clone();

        for &(atom_idx, atom) in &ordinary_atoms {
            let from_key = atom.baseline_key;
            for &to_key in &sound_keys {
                if to_key == from_key {
                    continue;
                }

                let mut candidate_state = anchor_state.clone();
                candidate_state.first_keys[atom_idx] = to_key;

                let cand_scheme =
                    build_scheme_state(&candidate_state, &fixture, &alphabet, tone_keys_by_tone)
                        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

                let direct = generated
                    .dependencies
                    .affected_rows(&current_anchor_scheme, &cand_scheme)
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

                candidates.push(CandidateResult {
                    rank: 0,
                    initial: atom.name.clone(),
                    from_key,
                    to_key,
                    score,
                    delta_anchor: score - anchor_score,
                    delta_mars0: score - mars0_score,
                    m_lower: 21,
                    m_guard: 23,
                    d: 1,
                    f: 0,
                    splits: 0,
                });

                // Rollback to keep resolver on anchor
                let rollback = resolver
                    .rollback(receipt)
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
                summary
                    .apply_changes(resolver.rows(), rollback.outcome_changes())
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

                if args.duty_ms > 0 {
                    thread::sleep(Duration::from_millis(args.duty_ms));
                }
            }
        }

        candidates.sort_by(|a, b| a.score.total_cmp(&b.score));
        for (i, cand) in candidates.iter_mut().enumerate() {
            cand.rank = i + 1;
        }

        let elapsed = start_time.elapsed().as_secs_f64();
        eprintln!(
            "Completed 360 D=1 candidate evaluations in {:.2}s ({:.1} evals/sec)",
            elapsed,
            total_candidates as f64 / elapsed
        );

        let better_count = candidates.iter().filter(|c| c.score < anchor_score).count();
        eprintln!(
            "Candidates beating anchor {:.12}: {} / 360",
            anchor_score, better_count
        );

        eprintln!("\n=== TOP 20 ORDINARY CONSONANT D=1 CANDIDATES ===");
        for cand in candidates.iter().take(20) {
            eprintln!(
                "#{:02}: {} -> {:2} | CKT: {:.12} (ΔAnchor: {:+.6}, ΔMars0: {:+.6}) | M={}/{} D={}/{} splits={}",
                cand.rank,
                cand.initial,
                cand.to_key,
                cand.score,
                cand.delta_anchor,
                cand.delta_mars0,
                cand.m_lower,
                cand.m_guard,
                cand.d,
                cand.f,
                cand.splits
            );
        }

        // Save full 360 evaluation to output
        if let Some(parent) = args.output.parent() {
            fs::create_dir_all(parent)?;
        }
        let output_json = serde_json::to_string_pretty(&serde_json::json!({
            "version": AUDIT_VERSION,
            "anchorScore": anchor_score,
            "mars0Score": mars0_score,
            "evaluated": total_candidates,
            "betterThanAnchor": better_count,
            "elapsedSeconds": elapsed,
            "topCandidates": &candidates[..candidates.len().min(50)],
            "allCandidates": &candidates,
        }))?;
        fs::write(&args.output, output_json)?;
        eprintln!("\nWrote full 360 screening results to {:?}", args.output);

        (candidates[0].clone(), candidates)
    };

    // Long-term exploration via simulated annealing if requested
    if args.anneal_steps > 0 {
        eprintln!("\n=== COMMENCING LONG-TERM EXPLORATION: RHYME ANNEALING WITH D=1 CHAMPION ===");
        eprintln!(
            "Anchor initial move: {} -> {} (1-hop CKT: {:.12}, ΔAnchor: {:+.6})",
            best_1hop.initial, best_1hop.to_key, best_1hop.score, best_1hop.delta_anchor
        );

        let best_atom_idx = ordinary_atoms
            .iter()
            .find(|(_, a)| a.name == best_1hop.initial)
            .map(|(idx, _)| *idx)
            .ok_or("atom not found")?;

        let mut current_state = anchor_state.clone();
        current_state.first_keys[best_atom_idx] = best_1hop.to_key;

        let mut current_scheme =
            build_scheme_state(&current_state, &fixture, &alphabet, tone_keys_by_tone)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        // Re-generate resolver base for current_scheme to establish clean baseline
        let d1_generated = corpus
            .generate(&current_scheme, InputMode::KeytaoV51)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        let motor_for_anneal = motor.clone();
        let mut d1_resolver = IncrementalResolver::new(d1_generated.rows, move |code| {
            motor_for_anneal.cost(code).map(|value| value.upper_ms)
        })
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        let mut d1_summary =
            IncrementalSummary::new(d1_resolver.rows(), d1_resolver.outcomes(), parameters)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        let base_d1_score =
            normalized_score(&d1_summary.summary(), &fixture.reference_effective_ms)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        eprintln!("Verified D=1 starting state CKT: {:.12}", base_d1_score);

        let mut best_state = current_state.clone();
        let mut current_score = base_d1_score;
        let mut best_score = base_d1_score;

        let mut rng = SimpleRng::new(1410786_u64);
        let mut accepted = 0_usize;
        let mut history = Vec::new();
        let anneal_start = Instant::now();

        let initial_temp = 0.015_f64;
        let final_temp = 0.0001_f64;
        let cooling_factor = (final_temp / initial_temp).powf(1.0 / args.anneal_steps as f64);
        let mut temp = initial_temp;

        for step in 1..=args.anneal_steps {
            let (candidate_anneal, desc) = mutate_rhyme_state(&current_state, &fixture, &mut rng);

            let cand_scheme =
                build_scheme_state(&candidate_anneal, &fixture, &alphabet, tone_keys_by_tone)
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

            let direct = d1_generated
                .dependencies
                .affected_rows(&current_scheme, &cand_scheme)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
            let updates = corpus
                .generate_updates(
                    &cand_scheme,
                    InputMode::KeytaoV51,
                    &d1_generated.dependencies,
                    &direct,
                )
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
            let receipt = d1_resolver
                .apply_updates(updates)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
            d1_summary
                .apply_changes(d1_resolver.rows(), receipt.outcome_changes())
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

            let score = normalized_score(&d1_summary.summary(), &fixture.reference_effective_ms)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

            let delta = score - current_score;
            let accept = if delta <= 0.0 {
                true
            } else {
                let p = (-delta / temp).exp();
                rng.next_f64() < p
            };

            if accept {
                current_state = candidate_anneal;
                current_scheme = cand_scheme;
                current_score = score;
                accepted += 1;

                if score < best_score {
                    let drop = best_score - score;
                    best_score = score;
                    best_state = current_state.clone();
                    eprintln!(
                        "  [Step {:04}/{:04}] ** NEW BEST **: CKT = {:.12} (ΔD1: {:+.6}, drop: {:.6}, ΔMars0: {:+.6}) | {}",
                        step,
                        args.anneal_steps,
                        score,
                        score - base_d1_score,
                        drop,
                        score - mars0_score,
                        desc
                    );
                    history.push(serde_json::json!({
                        "step": step,
                        "score": score,
                        "description": desc,
                    }));
                }
            } else {
                let rollback = d1_resolver
                    .rollback(receipt)
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
                d1_summary
                    .apply_changes(d1_resolver.rows(), rollback.outcome_changes())
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
            }

            temp *= cooling_factor;

            if step % 50 == 0 || step == args.anneal_steps {
                eprintln!(
                    "  [Step {:04}/{:04}] T={:.6}, curr={:.6}, best={:.6}, acc={}/{} ({:.1}%)",
                    step,
                    args.anneal_steps,
                    temp,
                    current_score,
                    best_score,
                    accepted,
                    step,
                    (accepted as f64 / step as f64) * 100.0
                );

                if let Some(parent) = args.anneal_checkpoint.parent() {
                    fs::create_dir_all(parent)?;
                }
                let cp_json = serde_json::to_string_pretty(&serde_json::json!({
                    "version": "ckt-v51-toned-2121-ordinary-d1-anneal-1",
                    "step": step,
                    "totalSteps": args.anneal_steps,
                    "bestScore": best_score,
                    "d1AnchorScore": base_d1_score,
                    "baseScore": anchor_score,
                    "mars0Score": mars0_score,
                    "initialMove": {
                        "initial": best_1hop.initial,
                        "from": best_1hop.from_key,
                        "to": best_1hop.to_key,
                    },
                    "bestState": best_state,
                    "history": history,
                }))?;
                fs::write(&args.anneal_checkpoint, cp_json)?;
            }

            if args.duty_ms > 0 {
                thread::sleep(Duration::from_millis(args.duty_ms));
            }
        }

        let anneal_elapsed = anneal_start.elapsed().as_secs_f64();
        eprintln!(
            "\nAnnealing complete in {:.2}s. Final Best CKT = {:.12} (Net drop: {:+.6} vs base, {:+.6} vs Mars0)",
            anneal_elapsed,
            best_score,
            best_score - anchor_score,
            best_score - mars0_score
        );

        if let Some(parent) = args.anneal_output.parent() {
            fs::create_dir_all(parent)?;
        }
        let res_json = serde_json::to_string_pretty(&serde_json::json!({
            "version": "ckt-v51-toned-2121-ordinary-d1-anneal-1",
            "evaluated": args.anneal_steps,
            "bestScore": best_score,
            "anchorScore": anchor_score,
            "mars0Score": mars0_score,
            "deltaAnchor": best_score - anchor_score,
            "deltaMars0": best_score - mars0_score,
            "initialMove": {
                "initial": best_1hop.initial,
                "from": best_1hop.from_key,
                "to": best_1hop.to_key,
            },
            "bestState": best_state,
            "history": history,
        }))?;
        fs::write(&args.anneal_output, res_json)?;
        eprintln!("Wrote anneal output to {:?}", args.anneal_output);
    }

    Ok(())
}
