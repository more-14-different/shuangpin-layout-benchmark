use ckt_v4_core::toned_bucket::*;
use ckt_v4_core::{
    CognitiveParameters, IncrementalResolver, IncrementalSummary, InputMode, KeyAlphabet, Kind,
    NativeCorpus, ProjectedMotor, Projection, RoleTables, Summary,
};
use serde::Deserialize;
use serde_json::json;
use std::{collections::HashMap, env, fs, path::Path, time::Instant};
#[derive(Deserialize)]
struct Candidate {
    id: String,
    state: AnnealState,
    memory: usize,
}
#[derive(Deserialize)]
struct Job {
    fixture: TrialFixture,
    candidates: Vec<Candidate>,
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

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    if args.len() != 5 {
        return Err("usage: audit-toned-rhyme-neighbors CORPUS SNAPSHOT JOB OUTPUT".into());
    }
    let job: Job = serde_json::from_str(&fs::read_to_string(&args[3])?)?;
    let fixture = &job.fixture;
    let corpus = NativeCorpus::open(&args[1])?;
    let alphabet = KeyAlphabet::new(&fixture.key_alphabet)?;
    let motor = projected_motor(&corpus, &alphabet, Path::new(&args[2]))?;
    let tone = parse_five_keys(&fixture.tone_keys_by_tone, &alphabet)?;
    let validator = BucketValidator::from_fixture(fixture, None)?;
    assert_eq!(validator.syllables.len(), 1407);
    let base = build_scheme_state(&job.candidates[0].state, fixture, &alphabet, tone)?;
    let generated = corpus.generate(&base, InputMode::KeytaoV51)?;
    let mut resolver = IncrementalResolver::new(generated.rows, move |code| {
        motor.cost(code).map(|v| v.upper_ms)
    })?;
    let mut summary = IncrementalSummary::new(
        resolver.rows(),
        resolver.outcomes(),
        CognitiveParameters {
            page_size: 6,
            selection_action_ms: 0.0,
            ..CognitiveParameters::default()
        },
    )?;
    let start = Instant::now();
    let mut results = Vec::new();
    let mut current = base;
    for c in &job.candidates {
        if c.memory > 24
            || calc_ordinary_d(&c.state, fixture) > 2
            || !validator.is_valid_forbidden(&c.state, &[('Q', 'Z')])
        {
            return Err(format!("invalid candidate {}", c.id).into());
        }
        let candidate = build_scheme_state(&c.state, fixture, &alphabet, tone)?;
        let direct = generated.dependencies.affected_rows(&current, &candidate)?;
        let updates = corpus.generate_updates(
            &candidate,
            InputMode::KeytaoV51,
            &generated.dependencies,
            &direct,
        )?;
        let receipt = resolver.apply_updates(updates)?;
        summary.apply_changes(resolver.rows(), receipt.outcome_changes())?;
        let score = normalized_score(&summary.summary(), &fixture.reference_effective_ms)?;
        current = candidate;
        results.push(json!({"id":c.id,"score":score,"memory":c.memory}));
        if results.len() % 10 == 0 || results.len() == job.candidates.len() {
            fs::write(
                &args[4],
                serde_json::to_string_pretty(
                    &json!({"completed":results.len(),"total":job.candidates.len(),"elapsedSeconds":start.elapsed().as_secs_f64(),"results":results}),
                )?,
            )?;
            eprintln!(
                "{}/{} {:.1}s {} {:.12}",
                results.len(),
                job.candidates.len(),
                start.elapsed().as_secs_f64(),
                c.id,
                score
            );
        }
    }
    Ok(())
}
