// Persistent exact four-track scorer; JSON lines on stdin/stdout.
use ckt_v4_core::toned_bucket::*;
use ckt_v4_core::{CognitiveParameters, InputMode, KeyAlphabet, Kind, NativeCorpus,
    ProjectedMotor, Projection, RoleTables, Summary, Row, Outcome, resolve, summarize};
#[cfg(feature = "cuda")]
use ckt_v4_core::{CudaResolvePlan, cuda_device_name};
use serde::Deserialize;
use serde_json::json;
use std::{collections::HashMap, env, fs, io::{self, BufRead, Write}, path::Path};
#[derive(Deserialize)]
struct Request { states: Vec<AnnealState>, #[serde(default)] verify: bool }
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


fn metrics(rows: &[Row], outcomes: &[Outcome], alphabet: &KeyAlphabet, reference: &[f64;4]) -> Result<serde_json::Value,String> {
    let summary = summarize(rows, outcomes, CognitiveParameters {
        page_size: 6, selection_action_ms: 0.0, ..CognitiveParameters::default()
    })?;
    let mut hits = [0.0_f64;4];
    let mut pinky = [0.0_f64;4];
    for out in outcomes {
        let row = &rows[out.row_index];
        for k in alphabet.unpack(out.code).chars() {
            hits[row.kind.index()] += row.weight;
            if "QAZ".contains(k) { pinky[row.kind.index()] += row.weight; }
        }
    }
    let load: Vec<f64> = (0..4).map(|i| pinky[i]/hits[i]).collect();
    Ok(json!({"ckt": normalized_score(&summary,reference)?,
        "pinky": load.iter().copied().fold(0.0_f64,f64::max), "pinkyTracks": load}))
}
fn main() -> Result<(),Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    if args.len()!=5 { return Err("usage: score-toned-stream CORPUS SNAPSHOT FIXTURE cpu|cuda".into()); }
    let gpu = match args[4].as_str() { "cpu"=>false,"cuda"=>true,_=>return Err("unknown backend".into()) };
    #[cfg(not(feature="cuda"))]
    if gpu { return Err("CUDA requires cargo build --features cuda".into()); }
    let fixture: TrialFixture = serde_json::from_str(&fs::read_to_string(&args[3])?)?;
    if fixture.tone_keys_by_tone != "IVUAO" { return Err("expected toneKeysByTone=IVUAO (shape AVUIO)".into()); }
    let corpus = NativeCorpus::open(&args[1])?;
    let alphabet = KeyAlphabet::new(&fixture.key_alphabet)?;
    let motor = projected_motor(&corpus,&alphabet,Path::new(&args[2]))?;
    let tone = parse_five_keys(&fixture.tone_keys_by_tone,&alphabet)?;
    #[cfg(feature="cuda")]
    let mut plan: Option<CudaResolvePlan> = None;
    let mut device = String::from("CPU");
    #[cfg(feature="cuda")]
    if gpu { device = cuda_device_name()?; }
    println!("{}",json!({"ready":true,"protocol":1,"device":device,"backend":args[4]}));
    io::stdout().flush()?;
    for line in io::stdin().lock().lines() {
        let request: Request = serde_json::from_str(&line?)?;
        if request.states.is_empty() || request.states.len()>4 { return Err("batch must contain 1..4 states".into()); }
        let generated = request.states.iter().map(|s| {
            if s.first_keys.len()!=fixture.atoms.len() || s.rhyme_keys.len()!=fixture.tone_regions.len()
                || s.rhyme_keys.iter().any(|r|r.len()!=fixture.rhyme_atoms.len()) {
                return Err("state dimensions differ from fixture".to_string());
            }
            let state = build_scheme_state(s,&fixture,&alphabet,tone)?;
            corpus.generate(&state,InputMode::KeytaoV51)
        }).collect::<Result<Vec<_>,String>>()?;
        let mut outputs = Vec::new();
        #[cfg(feature="cuda")]
        if gpu {
            if plan.is_none() { plan=Some(CudaResolvePlan::new(&generated[0].rows)?); }
            let lanes: Vec<&[Row]> = generated.iter().map(|g|g.rows.as_slice()).collect();
            outputs=plan.as_ref().unwrap().resolve_batch(&lanes,|c|motor.cost(c).map(|v|v.upper_ms))?.0;
        }
        if !gpu {
            outputs=generated.iter().map(|g|resolve(&g.rows,|c|motor.cost(c).map(|v|v.upper_ms))).collect::<Result<Vec<_>,_>>()?;
        }
        let mut results=Vec::new();
        for (g,out) in generated.iter().zip(&outputs) {
            if request.verify && gpu {
                let cpu=resolve(&g.rows,|c|motor.cost(c).map(|v|v.upper_ms))?;
                if cpu != *out { return Err("CUDA/CPU outcome mismatch; refusing score".into()); }
            }
            results.push(metrics(&g.rows,out,&alphabet,&fixture.reference_effective_ms)?);
        }
        println!("{}",json!({"results":results,"verified":request.verify || !gpu}));
        io::stdout().flush()?;
    }
    Ok(())
}
