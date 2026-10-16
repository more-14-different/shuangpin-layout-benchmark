use ckt_v4_core::{
    CognitiveParameters, IncrementalResolver, IncrementalSummary, InputMode, KeyAlphabet,
    NativeCorpus, ProjectedMotor, Projection, RegularLayout, RoleTables, SchemeFixture,
    SchemeState, Summary, composite_score, resolve, summarize,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};

const CHECKPOINT_VERSION: &str = "ckt-v4-native-anneal-3";
const INCREMENTAL_MAX_FRACTION: f64 = 0.08;

struct ModeState {
    mode: InputMode,
    dependencies: ckt_v4_core::DependencyIndex,
    resolver: IncrementalResolver,
    summary: IncrementalSummary,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Checkpoint {
    version: String,
    scheme_id: String,
    reference_id: String,
    iteration: usize,
    target_steps: usize,
    temperature: f64,
    rng_state: u64,
    current_score: f64,
    best_score: f64,
    accepted: usize,
    evaluated: usize,
    incremental_evaluated: usize,
    full_evaluated: usize,
    current_layout: RegularLayout,
    best_layout: RegularLayout,
}

struct Args {
    corpus: PathBuf,
    schemes: PathBuf,
    snapshot: PathBuf,
    scheme_id: String,
    reference_id: String,
    steps: usize,
    seed: u64,
    temperature: f64,
    checkpoint: PathBuf,
    checkpoint_every: usize,
    verify_every: usize,
    duty_ms: u64,
    resume: bool,
}

#[derive(Clone, Copy)]
struct SplitMix64 {
    state: u64,
}

impl SplitMix64 {
    fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut value = self.state;
        value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        value ^ (value >> 31)
    }

    fn index(&mut self, limit: usize) -> usize {
        (self.next_u64() % limit as u64) as usize
    }

    fn unit(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / ((1_u64 << 53) as f64))
    }
}

fn main() -> Result<(), String> {
    let args = parse_args()?;
    let corpus = NativeCorpus::open(&args.corpus)?;
    let fixture = SchemeFixture::open(&args.schemes)?;
    if fixture.key_alphabet != corpus.header().key_alphabet
        || fixture.source_hashes.get("html") != corpus.header().source_hashes.get("html")
    {
        return Err("scheme/native-corpus provenance differs".to_owned());
    }
    let alphabet = KeyAlphabet::new(&corpus.header().key_alphabet)?;
    let motor = load_motor(&corpus, &alphabet, &args.snapshot)?;
    let parameters = CognitiveParameters::default();

    let reference_input = fixture
        .schemes
        .iter()
        .find(|scheme| scheme.id == args.reference_id)
        .ok_or_else(|| format!("reference scheme {} is absent", args.reference_id))?;
    let reference_state =
        SchemeState::compile(reference_input, &alphabet, corpus.header().pinyin_count)?;
    let reference = score_full_modes(&corpus, &reference_state, &motor, parameters)?;

    let input = fixture
        .schemes
        .iter()
        .find(|scheme| scheme.id == args.scheme_id)
        .ok_or_else(|| format!("candidate scheme {} is absent", args.scheme_id))?;
    let initial_layout = fixture.compile_layout(input, &alphabet)?;
    let mut checkpoint = if args.resume {
        let value: Checkpoint = serde_json::from_str(
            &fs::read_to_string(&args.checkpoint).map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())?;
        if value.version != CHECKPOINT_VERSION
            || value.scheme_id != args.scheme_id
            || value.reference_id != args.reference_id
            || value.target_steps != args.steps
            || value.temperature.to_bits() != args.temperature.to_bits()
        {
            return Err(
                "checkpoint does not match scheme, reference, steps, or temperature".to_owned(),
            );
        }
        value
    } else {
        Checkpoint {
            version: CHECKPOINT_VERSION.to_owned(),
            scheme_id: args.scheme_id.clone(),
            reference_id: args.reference_id.clone(),
            iteration: 0,
            target_steps: args.steps,
            temperature: args.temperature,
            rng_state: args.seed,
            current_score: f64::NAN,
            best_score: f64::INFINITY,
            accepted: 0,
            evaluated: 0,
            incremental_evaluated: 0,
            full_evaluated: 0,
            current_layout: initial_layout.clone(),
            best_layout: initial_layout,
        }
    };
    checkpoint
        .current_layout
        .validate(&fixture.pinyin_map, &fixture.common_pinyin)?;
    let mut current_state = fixture.scheme_state(&checkpoint.current_layout)?;
    let mut modes = build_modes(&corpus, &current_state, &motor, parameters)?;
    let mut current_score = composite_score(&mode_summaries(&modes), &reference)?;
    if checkpoint.current_score.is_finite()
        && (checkpoint.current_score - current_score).abs() > 1e-8
    {
        return Err("checkpoint score does not reproduce from its layout".to_owned());
    }
    checkpoint.current_score = current_score;
    if !checkpoint.best_score.is_finite() {
        checkpoint.best_score = current_score;
        checkpoint.best_layout = checkpoint.current_layout.clone();
    }
    let mut rng = SplitMix64::new(checkpoint.rng_state);
    let started = Instant::now();

    for iteration in checkpoint.iteration..args.steps {
        let mut proposal = checkpoint.current_layout.clone();
        propose(&mut proposal, &mut rng)?;
        proposal.validate(&fixture.pinyin_map, &fixture.common_pinyin)?;
        let proposed_state = fixture.scheme_state(&proposal)?;
        let affected_by_mode = modes
            .iter()
            .map(|mode| {
                mode.dependencies
                    .affected_rows(&current_state, &proposed_state)
            })
            .collect::<Result<Vec<_>, _>>()?;
        let use_full_recompute = modes.iter().zip(&affected_by_mode).any(|(mode, affected)| {
            affected.len() as f64 > mode.resolver.rows().len() as f64 * INCREMENTAL_MAX_FRACTION
        });
        let mut replacement_modes = None;
        let mut receipts = Vec::with_capacity(modes.len());
        let proposed_score = if use_full_recompute {
            checkpoint.full_evaluated += 1;
            let replacement = build_modes(&corpus, &proposed_state, &motor, parameters)?;
            let score = composite_score(&mode_summaries(&replacement), &reference)?;
            replacement_modes = Some(replacement);
            score
        } else {
            checkpoint.incremental_evaluated += 1;
            for (mode, affected) in modes.iter_mut().zip(&affected_by_mode) {
                let updates = corpus.generate_updates(
                    &proposed_state,
                    mode.mode,
                    &mode.dependencies,
                    affected,
                )?;
                let receipt = mode.resolver.apply_updates(updates)?;
                mode.summary
                    .apply_changes(mode.resolver.rows(), receipt.outcome_changes())?;
                receipts.push(receipt);
            }
            composite_score(&mode_summaries(&modes), &reference)?
        };
        checkpoint.evaluated += 1;
        let progress = iteration as f64 / args.steps.max(1) as f64;
        let temperature = args.temperature * (1.0 - progress).powi(2) + 1e-9;
        let accept = proposed_score <= current_score
            || rng.unit()
                < ((current_score - proposed_score) / temperature)
                    .min(0.0)
                    .exp();
        if accept {
            if let Some(replacement) = replacement_modes {
                modes = replacement;
            }
            checkpoint.current_layout = proposal;
            current_state = proposed_state;
            current_score = proposed_score;
            checkpoint.accepted += 1;
            if proposed_score < checkpoint.best_score {
                checkpoint.best_score = proposed_score;
                checkpoint.best_layout = checkpoint.current_layout.clone();
            }
        } else if replacement_modes.is_none() {
            for (mode, receipt) in modes.iter_mut().zip(receipts).rev() {
                let rollback = mode.resolver.rollback(receipt)?;
                mode.summary
                    .apply_changes(mode.resolver.rows(), rollback.outcome_changes())?;
            }
        }
        checkpoint.iteration = iteration + 1;
        checkpoint.target_steps = args.steps;
        checkpoint.rng_state = rng.state;
        checkpoint.current_score = current_score;

        if args.verify_every > 0 && checkpoint.iteration % args.verify_every == 0 {
            verify_modes(&mut modes, parameters)?;
        }
        if args.checkpoint_every > 0 && checkpoint.iteration % args.checkpoint_every == 0 {
            write_checkpoint(&args.checkpoint, &checkpoint)?;
            println!(
                "checkpoint step={} current={:.9} best={:.9} accepted={}/{} paths=i{}/f{} elapsed={:.1}s",
                checkpoint.iteration,
                current_score,
                checkpoint.best_score,
                checkpoint.accepted,
                checkpoint.evaluated,
                checkpoint.incremental_evaluated,
                checkpoint.full_evaluated,
                started.elapsed().as_secs_f64()
            );
        }
        if args.duty_ms > 0 {
            thread::sleep(Duration::from_millis(args.duty_ms));
        }
    }
    verify_modes(&mut modes, parameters)?;
    write_checkpoint(&args.checkpoint, &checkpoint)?;
    println!(
        "complete steps={} current={:.9} best={:.9} accepted={}/{} paths=i{}/f{} elapsed={:.1}s checkpoint={}",
        checkpoint.iteration,
        current_score,
        checkpoint.best_score,
        checkpoint.accepted,
        checkpoint.evaluated,
        checkpoint.incremental_evaluated,
        checkpoint.full_evaluated,
        started.elapsed().as_secs_f64(),
        args.checkpoint.display()
    );
    Ok(())
}

fn propose(layout: &mut RegularLayout, rng: &mut SplitMix64) -> Result<(), String> {
    match rng.index(10) {
        0 => {
            let left = rng.index(5);
            let mut right = rng.index(4);
            if right >= left {
                right += 1;
            }
            layout.swap_tone_slots(left, right)
        }
        1..=5 => {
            let keys = layout.distinct_head_keys();
            let left = rng.index(keys.len());
            let mut right = rng.index(keys.len() - 1);
            if right >= left {
                right += 1;
            }
            layout.swap_head_keys(keys[left], keys[right])
        }
        _ => {
            let keys = layout.distinct_final_keys();
            let left = rng.index(keys.len());
            let mut right = rng.index(keys.len() - 1);
            if right >= left {
                right += 1;
            }
            layout.swap_final_keys(keys[left], keys[right])
        }
    }
}

fn build_modes(
    corpus: &NativeCorpus,
    scheme: &SchemeState,
    motor: &ProjectedMotor,
    parameters: CognitiveParameters,
) -> Result<Vec<ModeState>, String> {
    [InputMode::Keytao, InputMode::Sanpin]
        .into_iter()
        .map(|mode| {
            let generated = corpus.generate(scheme, mode)?;
            let incremental_motor = motor.clone();
            let resolver = IncrementalResolver::new(generated.rows, move |code| {
                incremental_motor.cost(code).map(|value| value.upper_ms)
            })?;
            let summary =
                IncrementalSummary::new(resolver.rows(), resolver.outcomes(), parameters)?;
            Ok(ModeState {
                mode,
                dependencies: generated.dependencies,
                resolver,
                summary,
            })
        })
        .collect()
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

fn mode_summaries(modes: &[ModeState]) -> Vec<Summary> {
    modes.iter().map(|mode| mode.summary.summary()).collect()
}

fn verify_modes(modes: &mut [ModeState], parameters: CognitiveParameters) -> Result<(), String> {
    for mode in modes {
        mode.resolver.verify_against_full_recompute()?;
        let exact = summarize(mode.resolver.rows(), mode.resolver.outcomes(), parameters)?;
        let incremental = mode.summary.summary();
        let left = composite_score(
            std::slice::from_ref(&incremental),
            std::slice::from_ref(&exact),
        )?;
        if (left - 10.0).abs() > 1e-9 {
            return Err(format!("incremental summary drifted: normalization={left}"));
        }
        mode.summary =
            IncrementalSummary::new(mode.resolver.rows(), mode.resolver.outcomes(), parameters)?;
    }
    Ok(())
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
            .map(|(donor, &weight)| {
                let donor = donor.chars().next().ok_or("empty donor key")?;
                alphabet
                    .index_of(donor)
                    .ok_or("unknown donor key")
                    .map(|index| (index, weight))
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

fn write_checkpoint(path: &Path, checkpoint: &Checkpoint) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let temporary = path.with_extension("tmp");
    let bytes = serde_json::to_vec_pretty(checkpoint).map_err(|error| error.to_string())?;
    fs::write(&temporary, bytes).map_err(|error| error.to_string())?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    fs::rename(&temporary, path).map_err(|error| error.to_string())
}

fn parse_args() -> Result<Args, String> {
    let mut values = env::args().skip(1);
    let corpus = PathBuf::from(
        values
            .next()
            .ok_or("usage: anneal-native CORPUS SCHEMES SNAPSHOT SCHEME_ID [options]")?,
    );
    let schemes = PathBuf::from(values.next().ok_or("missing SCHEMES")?);
    let snapshot = PathBuf::from(values.next().ok_or("missing SNAPSHOT")?);
    let scheme_id = values.next().ok_or("missing SCHEME_ID")?;
    let mut result = Args {
        corpus,
        schemes,
        snapshot,
        scheme_id: scheme_id.clone(),
        reference_id: "S005".to_owned(),
        steps: 100,
        seed: 1,
        temperature: 0.02,
        checkpoint: PathBuf::from(format!("research/checkpoints/{scheme_id}-ckt-v4.json")),
        checkpoint_every: 10,
        verify_every: 50,
        duty_ms: 5,
        resume: false,
    };
    while let Some(flag) = values.next() {
        match flag.as_str() {
            "--reference" => {
                result.reference_id = values.next().ok_or("--reference needs a value")?
            }
            "--steps" => result.steps = parse_value(values.next(), "--steps")?,
            "--seed" => result.seed = parse_value(values.next(), "--seed")?,
            "--temperature" => result.temperature = parse_value(values.next(), "--temperature")?,
            "--checkpoint" => {
                result.checkpoint =
                    PathBuf::from(values.next().ok_or("--checkpoint needs a value")?)
            }
            "--checkpoint-every" => {
                result.checkpoint_every = parse_value(values.next(), "--checkpoint-every")?
            }
            "--verify-every" => result.verify_every = parse_value(values.next(), "--verify-every")?,
            "--duty-ms" => result.duty_ms = parse_value(values.next(), "--duty-ms")?,
            "--resume" => result.resume = true,
            _ => return Err(format!("unknown option {flag}")),
        }
    }
    if result.steps == 0 || !result.temperature.is_finite() || result.temperature <= 0.0 {
        return Err("steps and temperature must be positive".to_owned());
    }
    Ok(result)
}

fn parse_value<T: std::str::FromStr>(value: Option<String>, flag: &str) -> Result<T, String> {
    value
        .ok_or_else(|| format!("{flag} needs a value"))?
        .parse()
        .map_err(|_| format!("invalid value for {flag}"))
}
