use ckt_v4_core::{
    CognitiveParameters, IncrementalResolver, IncrementalSummary, InputMode, KeyAlphabet, Kind,
    NativeCorpus, ProjectedMotor, Projection, RoleTables, SchemeState, Summary,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};

const CHECKPOINT_VERSION: &str = "ckt-v51-toned-2121-rust-trial-checkpoint-2";

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
    rhyme_atoms: Vec<RhymeAtom>,
    tone_regions: Vec<ToneRegion>,
    canonical_initial_keys: BTreeMap<char, char>,
    source_hashes: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Expected {
    score: f64,
    traditional_onset_d: usize,
    onset_fragmentation: usize,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Atom {
    name: String,
    initial: String,
    baseline_key: char,
    pinyin: Vec<usize>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RhymeAtom {
    name: String,
    pinyin: Vec<usize>,
    baseline_keys: BTreeMap<String, char>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToneRegion {
    name: String,
    keys: String,
    tones: Vec<u8>,
}

#[derive(Clone, Debug, Deserialize, Eq, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "kind")]
enum TrialMove {
    First {
        atom: usize,
        atom_name: String,
        key: char,
    },
    Rhyme {
        region: usize,
        region_name: String,
        rhyme: usize,
        rhyme_name: String,
        key: char,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CandidateResult {
    moves: Vec<TrialMove>,
    score: f64,
    memory_lower: usize,
    memory_guard: usize,
    tone_region_merge_lower: usize,
    traditional_onset_d: usize,
    onset_fragmentation: usize,
    direct_rows: usize,
    component_rows: usize,
    elapsed_ms: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Checkpoint {
    version: String,
    layout_id: String,
    source_hashes: BTreeMap<String, String>,
    beam: usize,
    proposal_space: String,
    phase: String,
    next_index: usize,
    evaluated: usize,
    direct_rows_total: usize,
    component_rows_total: usize,
    max_direct_rows: usize,
    max_component_rows: usize,
    elapsed_ms: f64,
    results: Vec<CandidateResult>,
}

struct Args {
    corpus: PathBuf,
    fixture: PathBuf,
    snapshot: PathBuf,
    output: PathBuf,
    checkpoint: PathBuf,
    beam: usize,
    proposal_space: String,
    max_evaluations: usize,
    checkpoint_every: usize,
    verify_every: usize,
    duty_ms: u64,
    resume: bool,
}

fn main() -> Result<(), String> {
    let args = parse_args()?;
    let fixture: TrialFixture = serde_json::from_str(
        &fs::read_to_string(&args.fixture).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    if fixture.version != "ckt-v51-toned-2121-rust-trial-2" {
        return Err(format!("unsupported trial fixture {}", fixture.version));
    }
    let corpus = NativeCorpus::open(&args.corpus)?;
    if corpus.header().pinyin_count != fixture.pinyin.len()
        || fixture.toned_codes.len() != fixture.pinyin.len()
        || corpus.header().key_alphabet != fixture.key_alphabet
    {
        return Err("trial fixture/native corpus topology differs".to_owned());
    }
    let alphabet = KeyAlphabet::new(&fixture.key_alphabet)?;
    let tone_keys_by_tone = parse_five_keys(&fixture.tone_keys_by_tone, &alphabet)?;
    let toned_codes = fixture
        .toned_codes
        .iter()
        .map(|tones| {
            let mut result = [None; 5];
            for (tone, code) in tones.iter().enumerate() {
                result[tone] = code
                    .as_deref()
                    .map(|value| parse_pair(value, &alphabet))
                    .transpose()?;
            }
            Ok(result)
        })
        .collect::<Result<Vec<[Option<[u8; 2]>; 5]>, String>>()?;
    let baseline = SchemeState::from_toned_codes(
        &fixture.layout_id,
        [21, 21],
        toned_codes,
        tone_keys_by_tone,
    )?;
    let (baseline_d, baseline_f) = diagnostics(&fixture, &[])?;
    if baseline_d != fixture.expected.traditional_onset_d
        || baseline_f != fixture.expected.onset_fragmentation
    {
        return Err(format!(
            "baseline D/F mismatch: Rust={baseline_d}/{baseline_f}, fixture={}/{}",
            fixture.expected.traditional_onset_d, fixture.expected.onset_fragmentation
        ));
    }
    let (baseline_memory_lower, baseline_memory_guard, baseline_merge_lower) =
        memory_diagnostics(&fixture, &[])?;
    if baseline_memory_lower != fixture.baseline_memory_lower
        || baseline_memory_guard != fixture.baseline_memory_guard
        || baseline_merge_lower != fixture.baseline_tone_region_merge_lower
    {
        return Err(format!(
            "baseline M mismatch: Rust={baseline_memory_lower}/{baseline_memory_guard}/merge{baseline_merge_lower}, fixture={}/{}/merge{}",
            fixture.baseline_memory_lower,
            fixture.baseline_memory_guard,
            fixture.baseline_tone_region_merge_lower
        ));
    }

    let motor = projected_motor(&corpus, &alphabet, &args.snapshot)?;
    let generated = corpus.generate(&baseline, InputMode::KeytaoV51)?;
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
    let baseline_summary = summary.summary();
    let baseline_score = normalized_score(&baseline_summary, &fixture.reference_effective_ms)?;
    if (baseline_score - fixture.expected.score).abs() > 1e-9 {
        return Err(format!(
            "JS/Rust baseline mismatch: Rust={baseline_score:.12}, JS={:.12}",
            fixture.expected.score
        ));
    }
    eprintln!(
        "baseline parity ok: {:.12}, rows={}, atoms={}, D/F={}/{}",
        baseline_score,
        resolver.rows().len(),
        fixture.atoms.len(),
        baseline_d,
        baseline_f
    );

    let one_hop = candidate_one_hop(&fixture, &args.proposal_space);
    let mut checkpoint = if args.resume {
        let value: Checkpoint = serde_json::from_str(
            &fs::read_to_string(&args.checkpoint).map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())?;
        if value.version != CHECKPOINT_VERSION
            || value.layout_id != fixture.layout_id
            || value.source_hashes != fixture.source_hashes
            || value.beam != args.beam
            || value.proposal_space != args.proposal_space
        {
            return Err("checkpoint contract differs".to_owned());
        }
        value
    } else {
        Checkpoint {
            version: CHECKPOINT_VERSION.to_owned(),
            layout_id: fixture.layout_id.clone(),
            source_hashes: fixture.source_hashes.clone(),
            beam: args.beam,
            proposal_space: args.proposal_space.clone(),
            phase: "one-hop".to_owned(),
            next_index: 0,
            evaluated: 0,
            direct_rows_total: 0,
            component_rows_total: 0,
            max_direct_rows: 0,
            max_component_rows: 0,
            elapsed_ms: 0.0,
            results: Vec::new(),
        }
    };
    let run_started = Instant::now();
    let mut invocation_evaluated = 0_usize;

    loop {
        let queue = if checkpoint.phase == "one-hop" {
            one_hop.clone()
        } else if checkpoint.phase == "two-hop" {
            candidate_two_hop(
                &fixture,
                &checkpoint.results,
                args.beam,
                &args.proposal_space,
            )
        } else {
            break;
        };
        while checkpoint.next_index < queue.len() && invocation_evaluated < args.max_evaluations {
            let moves = &queue[checkpoint.next_index];
            let started = Instant::now();
            let candidate = apply_moves(&baseline, &fixture, moves, &alphabet)?;
            let direct = generated
                .dependencies
                .affected_rows(&baseline, &candidate)?;
            let updates = corpus.generate_updates(
                &candidate,
                InputMode::KeytaoV51,
                &generated.dependencies,
                &direct,
            )?;
            let receipt = resolver.apply_updates(updates)?;
            summary.apply_changes(resolver.rows(), receipt.outcome_changes())?;
            if args.verify_every > 0 && checkpoint.evaluated.is_multiple_of(args.verify_every) {
                resolver.verify_against_full_recompute()?;
            }
            let score = normalized_score(&summary.summary(), &fixture.reference_effective_ms)?;
            let (d, f) = diagnostics(&fixture, moves)?;
            let (memory_lower, memory_guard, tone_region_merge_lower) =
                memory_diagnostics(&fixture, moves)?;
            let component_rows = receipt.affected_rows;
            let rollback = resolver.rollback(receipt)?;
            summary.apply_changes(resolver.rows(), rollback.outcome_changes())?;
            let result = CandidateResult {
                moves: moves.clone(),
                score,
                memory_lower,
                memory_guard,
                tone_region_merge_lower,
                traditional_onset_d: d,
                onset_fragmentation: f,
                direct_rows: direct.len(),
                component_rows,
                elapsed_ms: started.elapsed().as_secs_f64() * 1_000.0,
            };
            checkpoint.direct_rows_total += result.direct_rows;
            checkpoint.component_rows_total += result.component_rows;
            checkpoint.max_direct_rows = checkpoint.max_direct_rows.max(result.direct_rows);
            checkpoint.max_component_rows =
                checkpoint.max_component_rows.max(result.component_rows);
            checkpoint.results.push(result);
            checkpoint.next_index += 1;
            checkpoint.evaluated += 1;
            invocation_evaluated += 1;
            if args.checkpoint_every > 0
                && checkpoint.evaluated.is_multiple_of(args.checkpoint_every)
            {
                save_checkpoint(&args.checkpoint, &checkpoint, run_started.elapsed())?;
            }
            if args.duty_ms > 0 {
                thread::sleep(Duration::from_millis(args.duty_ms));
            }
        }
        if invocation_evaluated >= args.max_evaluations {
            break;
        }
        if checkpoint.next_index < queue.len() {
            break;
        }
        if checkpoint.phase == "one-hop" && args.beam > 0 {
            checkpoint.phase = "two-hop".to_owned();
            checkpoint.next_index = 0;
        } else {
            checkpoint.phase = "complete".to_owned();
            break;
        }
    }
    checkpoint.elapsed_ms += run_started.elapsed().as_secs_f64() * 1_000.0;
    write_json(&args.checkpoint, &checkpoint)?;
    write_report(
        &args.output,
        &fixture,
        baseline_score,
        resolver.rows().len(),
        &checkpoint,
    )?;
    eprintln!(
        "trial {}: evaluated={}, invocation={}, elapsed={:.3}s",
        checkpoint.phase,
        checkpoint.evaluated,
        invocation_evaluated,
        checkpoint.elapsed_ms / 1_000.0
    );
    Ok(())
}

fn parse_args() -> Result<Args, String> {
    let values = env::args().skip(1).collect::<Vec<_>>();
    if values.len() < 3 {
        return Err("usage: trial-toned-pareto CORPUS FIXTURE SNAPSHOT [--proposal-space first|rhyme|joint] [options]".to_owned());
    }
    let mut args = Args {
        corpus: PathBuf::from(&values[0]),
        fixture: PathBuf::from(&values[1]),
        snapshot: PathBuf::from(&values[2]),
        output: PathBuf::from("research/.cache/ckt-v51-toned-rust-trial-result.json"),
        checkpoint: PathBuf::from("research/.cache/ckt-v51-toned-rust-trial-checkpoint.json"),
        beam: 0,
        proposal_space: "joint".to_owned(),
        max_evaluations: usize::MAX,
        checkpoint_every: 100,
        verify_every: 250,
        duty_ms: 0,
        resume: false,
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
            "--beam" => args.beam = next(&mut index)?.parse().map_err(|_| "invalid beam")?,
            "--proposal-space" => {
                args.proposal_space = next(&mut index)?.to_owned();
                if !matches!(args.proposal_space.as_str(), "first" | "rhyme" | "joint") {
                    return Err("proposal-space must be first, rhyme, or joint".to_owned());
                }
            }
            "--max-evaluations" => {
                args.max_evaluations = next(&mut index)?
                    .parse()
                    .map_err(|_| "invalid max-evaluations")?
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
            "--resume" => args.resume = true,
            _ => return Err(format!("unknown option {value}")),
        }
        index += 1;
    }
    Ok(args)
}

fn parse_pair(value: &str, alphabet: &KeyAlphabet) -> Result<[u8; 2], String> {
    let keys = value.chars().collect::<Vec<_>>();
    if keys.len() != 2 {
        return Err(format!("expected two-key code, got {value:?}"));
    }
    Ok([
        alphabet
            .index_of(keys[0])
            .ok_or_else(|| format!("unknown key {}", keys[0]))? as u8,
        alphabet
            .index_of(keys[1])
            .ok_or_else(|| format!("unknown key {}", keys[1]))? as u8,
    ])
}

fn parse_five_keys(value: &str, alphabet: &KeyAlphabet) -> Result<[u8; 5], String> {
    let keys = value.chars().collect::<Vec<_>>();
    if keys.len() != 5 {
        return Err("toneKeysByTone must contain five keys".to_owned());
    }
    let values = keys
        .into_iter()
        .map(|key| {
            alphabet
                .index_of(key)
                .map(|value| value as u8)
                .ok_or_else(|| format!("unknown tone key {key}"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(values.try_into().expect("five keys"))
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

fn candidate_one_hop(fixture: &TrialFixture, proposal_space: &str) -> Vec<Vec<TrialMove>> {
    let mut result = Vec::new();
    if proposal_space != "rhyme" {
        result.extend(fixture.atoms.iter().enumerate().flat_map(|(atom, value)| {
            fixture
                .sound_keys
                .chars()
                .filter(move |&key| key != value.baseline_key)
                .map(move |key| {
                    vec![TrialMove::First {
                        atom,
                        atom_name: value.name.clone(),
                        key,
                    }]
                })
        }));
    }
    if proposal_space != "first" {
        for (region, tone_region) in fixture.tone_regions.iter().enumerate() {
            for (rhyme, value) in fixture.rhyme_atoms.iter().enumerate() {
                let baseline = value.baseline_keys[&tone_region.name];
                for key in tone_region.keys.chars().filter(|&key| key != baseline) {
                    result.push(vec![TrialMove::Rhyme {
                        region,
                        region_name: tone_region.name.clone(),
                        rhyme,
                        rhyme_name: value.name.clone(),
                        key,
                    }]);
                }
            }
        }
    }
    result
}

fn candidate_two_hop(
    fixture: &TrialFixture,
    results: &[CandidateResult],
    beam: usize,
    proposal_space: &str,
) -> Vec<Vec<TrialMove>> {
    let mut leaders = results
        .iter()
        .filter(|value| value.moves.len() == 1)
        .collect::<Vec<_>>();
    leaders.sort_by(|left, right| left.score.total_cmp(&right.score));
    let mut unique = BTreeSet::new();
    let one_hop = candidate_one_hop(fixture, proposal_space);
    for leader in leaders.into_iter().take(beam) {
        let first = &leader.moves[0];
        for second in &one_hop {
            let second = &second[0];
            if !moves_are_compatible(first, second) {
                continue;
            }
            let mut moves = vec![first.clone(), second.clone()];
            moves.sort();
            unique.insert(moves);
        }
    }
    unique.into_iter().collect()
}

fn moves_are_compatible(left: &TrialMove, right: &TrialMove) -> bool {
    match (left, right) {
        (TrialMove::First { atom: left, .. }, TrialMove::First { atom: right, .. }) => {
            left != right
        }
        (
            TrialMove::Rhyme {
                region: left_region,
                rhyme: left_rhyme,
                ..
            },
            TrialMove::Rhyme {
                region: right_region,
                rhyme: right_rhyme,
                ..
            },
        ) => left_region != right_region || left_rhyme != right_rhyme,
        _ => true,
    }
}

fn apply_moves(
    baseline: &SchemeState,
    fixture: &TrialFixture,
    moves: &[TrialMove],
    alphabet: &KeyAlphabet,
) -> Result<SchemeState, String> {
    let mut state = baseline.clone();
    for movement in moves {
        match movement {
            TrialMove::First { atom, key, .. } => {
                let first = alphabet.index_of(*key).ok_or("move key outside alphabet")? as u8;
                let atom = fixture
                    .atoms
                    .get(*atom)
                    .ok_or("move atom outside fixture")?;
                for &py in &atom.pinyin {
                    for tone in 1..=5_u8 {
                        if let Some(mut code) = state.code_at_tone(py, tone) {
                            code[0] = first;
                            state.assign_toned_code(py, tone, Some(code))?;
                        }
                    }
                }
            }
            TrialMove::Rhyme {
                region, rhyme, key, ..
            } => {
                let second = alphabet.index_of(*key).ok_or("move key outside alphabet")? as u8;
                let tone_region = fixture
                    .tone_regions
                    .get(*region)
                    .ok_or("move tone region outside fixture")?;
                if !tone_region.keys.contains(*key) {
                    return Err(format!(
                        "rhyme move key {key} leaves region {}",
                        tone_region.name
                    ));
                }
                let rhyme = fixture
                    .rhyme_atoms
                    .get(*rhyme)
                    .ok_or("move rhyme outside fixture")?;
                for &py in &rhyme.pinyin {
                    for &tone in &tone_region.tones {
                        if let Some(mut code) = state.code_at_tone(py, tone) {
                            code[1] = second;
                            state.assign_toned_code(py, tone, Some(code))?;
                        }
                    }
                }
            }
        }
    }
    Ok(state)
}

fn diagnostics(fixture: &TrialFixture, moves: &[TrialMove]) -> Result<(usize, usize), String> {
    let changed = moves
        .iter()
        .filter_map(|value| match value {
            TrialMove::First { atom, key, .. } => Some((*atom, *key)),
            TrialMove::Rhyme { .. } => None,
        })
        .collect::<BTreeMap<_, _>>();
    let mut incidences: BTreeMap<char, HashSet<char>> = fixture
        .canonical_initial_keys
        .keys()
        .copied()
        .map(|key| (key, HashSet::new()))
        .collect();
    for (index, atom) in fixture.atoms.iter().enumerate() {
        let Some(initial) = atom.initial.chars().next().filter(|value| *value != '_') else {
            continue;
        };
        let keys = incidences
            .get_mut(&initial)
            .ok_or_else(|| format!("unexpected initial {}", atom.initial))?;
        keys.insert(changed.get(&index).copied().unwrap_or(atom.baseline_key));
    }
    let displaced = incidences
        .iter()
        .filter(|(initial, keys)| {
            let canonical = fixture.canonical_initial_keys[initial];
            keys.iter().any(|&key| key != canonical)
        })
        .count();
    let fragmentation = incidences
        .values()
        .map(HashSet::len)
        .sum::<usize>()
        .saturating_sub(incidences.len());
    Ok((displaced, fragmentation))
}

fn memory_diagnostics(
    fixture: &TrialFixture,
    moves: &[TrialMove],
) -> Result<(usize, usize, usize), String> {
    let first_exceptions = moves
        .iter()
        .filter(|movement| matches!(movement, TrialMove::First { .. }))
        .count();
    let rhyme_changes = moves
        .iter()
        .filter_map(|movement| match movement {
            TrialMove::Rhyme {
                region, rhyme, key, ..
            } => Some(((*region, *rhyme), *key)),
            TrialMove::First { .. } => None,
        })
        .collect::<BTreeMap<_, _>>();
    let mut merge_lower = 0_usize;
    for (region, tone_region) in fixture.tone_regions.iter().enumerate() {
        let mut keys = BTreeSet::new();
        for (rhyme, atom) in fixture.rhyme_atoms.iter().enumerate() {
            let key = rhyme_changes
                .get(&(region, rhyme))
                .copied()
                .unwrap_or(atom.baseline_keys[&tone_region.name]);
            if !tone_region.keys.contains(key) {
                return Err(format!(
                    "rhyme {}/{} uses key {key} outside its tone region",
                    atom.name, tone_region.name
                ));
            }
            keys.insert(key);
        }
        merge_lower += fixture.rhyme_atoms.len().saturating_sub(keys.len());
    }
    let merge_delta = merge_lower as isize - fixture.baseline_tone_region_merge_lower as isize;
    let adjust = |baseline: usize| -> usize {
        if merge_delta >= 0 {
            baseline + first_exceptions + merge_delta as usize
        } else {
            baseline + first_exceptions - (-merge_delta) as usize
        }
    };
    Ok((
        adjust(fixture.baseline_memory_lower),
        adjust(fixture.baseline_memory_guard),
        merge_lower,
    ))
}

fn save_checkpoint(path: &Path, checkpoint: &Checkpoint, elapsed: Duration) -> Result<(), String> {
    let mut value = checkpoint.clone();
    value.elapsed_ms += elapsed.as_secs_f64() * 1_000.0;
    write_json(path, &value)
}

fn write_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(
        path,
        serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())
}

fn write_report(
    path: &Path,
    fixture: &TrialFixture,
    baseline_score: f64,
    row_count: usize,
    checkpoint: &Checkpoint,
) -> Result<(), String> {
    let mut pareto = Vec::<&CandidateResult>::new();
    let mut ranked = checkpoint.results.iter().collect::<Vec<_>>();
    ranked.sort_by(|left, right| left.score.total_cmp(&right.score));
    for candidate in &ranked {
        if pareto.iter().any(|other| {
            other.score <= candidate.score
                && other.memory_guard <= candidate.memory_guard
                && other.traditional_onset_d <= candidate.traditional_onset_d
                && other.onset_fragmentation <= candidate.onset_fragmentation
        }) {
            continue;
        }
        pareto.retain(|other| {
            !(candidate.score <= other.score
                && candidate.memory_guard <= other.memory_guard
                && candidate.traditional_onset_d <= other.traditional_onset_d
                && candidate.onset_fragmentation <= other.onset_fragmentation)
        });
        pareto.push(candidate);
    }
    let elapsed_seconds = checkpoint.elapsed_ms / 1_000.0;
    let report = serde_json::json!({
        "version": "ckt-v51-toned-2121-rust-trial-result-2",
        "layoutId": fixture.layout_id,
        "status": checkpoint.phase,
        "baselineScore": baseline_score,
        "rowCount": row_count,
        "evaluated": checkpoint.evaluated,
        "proposalSpace": checkpoint.proposal_space,
        "elapsedSeconds": elapsed_seconds,
        "candidatesPerSecond": if elapsed_seconds > 0.0 { checkpoint.evaluated as f64 / elapsed_seconds } else { 0.0 },
        "meanDirectRows": if checkpoint.evaluated > 0 { checkpoint.direct_rows_total as f64 / checkpoint.evaluated as f64 } else { 0.0 },
        "meanComponentRows": if checkpoint.evaluated > 0 { checkpoint.component_rows_total as f64 / checkpoint.evaluated as f64 } else { 0.0 },
        "maxDirectRows": checkpoint.max_direct_rows,
        "maxComponentRows": checkpoint.max_component_rows,
        "best": ranked.into_iter().take(32).collect::<Vec<_>>(),
        "pareto": pareto,
    });
    write_json(path, &report)
}
