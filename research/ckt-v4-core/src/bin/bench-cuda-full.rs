use ckt_v4_core::{
    CognitiveParameters, CudaResolvePlan, InputMode, KeyAlphabet, NativeCorpus, ProjectedMotor,
    Projection, RoleTables, SchemeFixture, SchemeState, cuda_device_name, resolve, summarize,
};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::time::Instant;

fn main() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let corpus_path = args
        .next()
        .ok_or("usage: bench-cuda-full CORPUS SCHEMES SNAPSHOT [SCHEME ...]")?;
    let schemes_path = args
        .next()
        .ok_or("usage: bench-cuda-full CORPUS SCHEMES SNAPSHOT [SCHEME ...]")?;
    let snapshot_path = args
        .next()
        .ok_or("usage: bench-cuda-full CORPUS SCHEMES SNAPSHOT [SCHEME ...]")?;
    let requested: Vec<_> = args.collect();

    let corpus = NativeCorpus::open(corpus_path)?;
    let fixture = SchemeFixture::open(schemes_path)?;
    if fixture.key_alphabet != corpus.header().key_alphabet
        || fixture.source_hashes.get("html") != corpus.header().source_hashes.get("html")
    {
        return Err("scheme/native-corpus provenance differs".to_owned());
    }
    let alphabet = KeyAlphabet::new(&corpus.header().key_alphabet)?;
    let motor = load_motor(&corpus, &alphabet, &snapshot_path)?;
    let selected: Vec<_> = fixture
        .schemes
        .iter()
        .filter(|scheme| requested.is_empty() || requested.contains(&scheme.id))
        .collect();
    if selected.is_empty() {
        return Err("none of the requested schemes is present".to_owned());
    }
    println!("CUDA device: {}", cuda_device_name()?);
    println!(
        "schemes={} (CUDA context is warmed before timing)",
        selected.len()
    );

    let mut cpu_total = 0.0;
    let mut gpu_total = 0.0;
    let mut generation_total = 0.0;
    let mut plan_total = 0.0;
    let mut compared_rows = 0_usize;
    let mut warmed = false;
    for input in selected {
        let scheme = SchemeState::compile(input, &alphabet, corpus.header().pinyin_count)?;
        for mode in [InputMode::Keytao, InputMode::Sanpin] {
            let started = Instant::now();
            let generated = corpus.generate(&scheme, mode)?;
            let generation_ms = started.elapsed().as_secs_f64() * 1_000.0;

            let started = Instant::now();
            let plan = CudaResolvePlan::new(&generated.rows)?;
            let plan_ms = started.elapsed().as_secs_f64() * 1_000.0;

            let started = Instant::now();
            let cpu = resolve(&generated.rows, |code| {
                motor.cost(code).map(|value| value.upper_ms)
            })?;
            let cpu_ms = started.elapsed().as_secs_f64() * 1_000.0;

            if !warmed {
                plan.resolve(&generated.rows, |code| {
                    motor.cost(code).map(|value| value.upper_ms)
                })?;
                warmed = true;
            }
            let started = Instant::now();
            let (gpu, timings) = plan.resolve(&generated.rows, |code| {
                motor.cost(code).map(|value| value.upper_ms)
            })?;
            let gpu_ms = started.elapsed().as_secs_f64() * 1_000.0;
            if cpu != gpu {
                let mismatch = cpu
                    .iter()
                    .zip(&gpu)
                    .position(|(left, right)| left != right)
                    .unwrap_or(usize::MAX);
                return Err(format!(
                    "CUDA outcome mismatch for {}/{} at row {mismatch}",
                    scheme.id,
                    mode_name(mode)
                ));
            }
            let cpu_summary = summarize(&generated.rows, &cpu, CognitiveParameters::default())?;
            let gpu_summary = summarize(&generated.rows, &gpu, CognitiveParameters::default())?;
            if cpu_summary != gpu_summary {
                return Err(format!(
                    "CUDA summary mismatch for {}/{}",
                    scheme.id,
                    mode_name(mode)
                ));
            }
            println!(
                "{}/{} rows={} entries={} launches={} generation={generation_ms:.1}ms plan={plan_ms:.1}ms cpu={cpu_ms:.1}ms cuda={gpu_ms:.1}ms speedup={:.2}x [prepare={:.1} device={:.1} finalize={:.1}] exact=yes",
                scheme.id,
                mode_name(mode),
                generated.rows.len(),
                timings.entries,
                timings.launches,
                cpu_ms / gpu_ms,
                timings.preparation.as_secs_f64() * 1_000.0,
                timings.device.as_secs_f64() * 1_000.0,
                timings.finalization.as_secs_f64() * 1_000.0,
            );
            generation_total += generation_ms;
            plan_total += plan_ms;
            cpu_total += cpu_ms;
            gpu_total += gpu_ms;
            compared_rows += generated.rows.len();
        }
    }
    println!(
        "TOTAL rows={compared_rows} generation={generation_total:.1}ms one-time-plan={plan_total:.1}ms cpu={cpu_total:.1}ms cuda={gpu_total:.1}ms resolver-speedup={:.2}x exact=yes",
        cpu_total / gpu_total
    );
    Ok(())
}

const fn mode_name(mode: InputMode) -> &'static str {
    match mode {
        InputMode::Keytao => "keytao",
        InputMode::Sanpin => "sanpin",
    }
}

fn load_motor(
    corpus: &NativeCorpus,
    alphabet: &KeyAlphabet,
    snapshot_path: &str,
) -> Result<ProjectedMotor, String> {
    let native = RoleTables::from_snapshot_json(
        alphabet,
        &fs::read_to_string(snapshot_path).map_err(|error| error.to_string())?,
        0.0,
    )?;
    let mut projections = HashMap::new();
    for (key, extension) in &corpus.header().extension_maps {
        let key = key.chars().next().ok_or("empty extension key")?;
        let global = alphabet
            .index_of(key)
            .ok_or_else(|| format!("unknown extension {key:?}"))?;
        let donors = extension
            .donors
            .iter()
            .map(|(donor, &weight)| {
                let donor = donor.chars().next().ok_or("empty donor key")?;
                alphabet
                    .index_of(donor)
                    .ok_or_else(|| format!("unknown donor {donor:?}"))
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
