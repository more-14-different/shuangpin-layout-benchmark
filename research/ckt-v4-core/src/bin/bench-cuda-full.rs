use ckt_v4_core::{
    CognitiveParameters, CudaResolvePlan, InputMode, KeyAlphabet, NativeCorpus, ProjectedMotor,
    Projection, RoleTables, SchemeFixture, SchemeInput, SchemeState, cuda_device_name, resolve,
    summarize,
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
    let mut finalist_total = 0.0;
    let mut generation_total = 0.0;
    let mut plan_total = 0.0;
    let mut compared_rows = 0_usize;
    for input in &selected {
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

            plan.resolve_rank_only(&generated.rows, |code| {
                motor.cost(code).map(|value| value.upper_ms)
            })?;
            let started = Instant::now();
            let (rank_only, _) = plan.resolve_rank_only(&generated.rows, |code| {
                motor.cost(code).map(|value| value.upper_ms)
            })?;
            let rank_only_ms = started.elapsed().as_secs_f64() * 1_000.0;

            let started = Instant::now();
            let (cold_gpu, _cold_timings) = plan.resolve_fused(&generated.rows, |code| {
                motor.cost(code).map(|value| value.upper_ms)
            })?;
            let _cold_gpu_ms = started.elapsed().as_secs_f64() * 1_000.0;
            let started = Instant::now();
            let (gpu, timings) = plan.resolve_fused(&generated.rows, |code| {
                motor.cost(code).map(|value| value.upper_ms)
            })?;
            let gpu_ms = started.elapsed().as_secs_f64() * 1_000.0;
            plan.resolve_batch(&[&generated.rows], |code| {
                motor.cost(code).map(|value| value.upper_ms)
            })?;
            let started = Instant::now();
            let (finalist_batch, finalist_timings) = plan
                .resolve_batch(&[&generated.rows], |code| {
                    motor.cost(code).map(|value| value.upper_ms)
                })?;
            let finalist_ms = started.elapsed().as_secs_f64() * 1_000.0;
            let finalist = &finalist_batch[0];
            if cpu != rank_only || cpu != cold_gpu || cpu != gpu || cpu != *finalist {
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
                "{}/{} rows={} entries={} unique-codes={} finalists={} launches={} generation={generation_ms:.1}ms plan={plan_ms:.1}ms cpu={cpu_ms:.1}ms rank-only={rank_only_ms:.1}ms fused={gpu_ms:.1}ms finalist={finalist_ms:.1}ms finalist/rank-only={:.2}x fused/rank-only={:.2}x cpu-speedup={:.2}x [finalist-device={:.1} prepare={:.1} finalize={:.1}] exact=yes",
                scheme.id,
                mode_name(mode),
                generated.rows.len(),
                timings.entries,
                timings.unique_codes,
                finalist_timings.finalists,
                timings.launches,
                rank_only_ms / finalist_ms,
                rank_only_ms / gpu_ms,
                cpu_ms / finalist_ms,
                finalist_timings.device.as_secs_f64() * 1_000.0,
                finalist_timings.preparation.as_secs_f64() * 1_000.0,
                finalist_timings.finalization.as_secs_f64() * 1_000.0,
            );
            generation_total += generation_ms;
            plan_total += plan_ms;
            cpu_total += cpu_ms;
            gpu_total += gpu_ms;
            finalist_total += finalist_ms;
            compared_rows += generated.rows.len();
        }
    }
    println!(
        "TOTAL rows={compared_rows} generation={generation_total:.1}ms one-time-plan={plan_total:.1}ms cpu={cpu_total:.1}ms fused={gpu_total:.1}ms finalists={finalist_total:.1}ms finalist-speedup={:.2}x exact=yes",
        cpu_total / finalist_total
    );
    benchmark_batch(&corpus, &alphabet, &motor, &selected)?;
    Ok(())
}

fn benchmark_batch(
    corpus: &NativeCorpus,
    alphabet: &KeyAlphabet,
    motor: &ProjectedMotor,
    selected: &[&SchemeInput],
) -> Result<(), String> {
    const BATCH_SIZE: usize = 8;
    println!("BATCH candidates={BATCH_SIZE} (same-mode lanes are rank-isolated)");
    for mode in [InputMode::Keytao, InputMode::Sanpin] {
        let generated = selected
            .iter()
            .map(|input| {
                let scheme = SchemeState::compile(input, alphabet, corpus.header().pinyin_count)?;
                corpus.generate(&scheme, mode)
            })
            .collect::<Result<Vec<_>, String>>()?;
        let lanes: Vec<&[_]> = (0..BATCH_SIZE)
            .map(|index| generated[index % generated.len()].rows.as_slice())
            .collect();
        let expected_unique = generated
            .iter()
            .map(|candidate| {
                resolve(&candidate.rows, |code| {
                    motor.cost(code).map(|value| value.upper_ms)
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        let expected: Vec<_> = (0..BATCH_SIZE)
            .map(|index| expected_unique[index % expected_unique.len()].clone())
            .collect();
        let plan = CudaResolvePlan::new(lanes[0])?;
        plan.resolve_fused(lanes[0], |code| {
            motor.cost(code).map(|value| value.upper_ms)
        })?;

        let started = Instant::now();
        let sequential = lanes
            .iter()
            .map(|rows| {
                plan.resolve_fused(rows, |code| motor.cost(code).map(|value| value.upper_ms))
                    .map(|(outcomes, _)| outcomes)
            })
            .collect::<Result<Vec<_>, _>>()?;
        let sequential_ms = started.elapsed().as_secs_f64() * 1_000.0;
        if sequential != expected {
            return Err(format!(
                "sequential persistent CUDA mismatch for {}",
                mode_name(mode)
            ));
        }

        plan.resolve_batch_rank_only(&lanes, |code| motor.cost(code).map(|value| value.upper_ms))?;
        let started = Instant::now();
        let (rank_only_batch, _) = plan
            .resolve_batch_rank_only(&lanes, |code| motor.cost(code).map(|value| value.upper_ms))?;
        let rank_only_batch_ms = started.elapsed().as_secs_f64() * 1_000.0;
        if rank_only_batch != expected {
            return Err(format!(
                "rank-only CUDA batch mismatch for {}",
                mode_name(mode)
            ));
        }

        let started = Instant::now();
        let (cold_batch, cold_timings) =
            plan.resolve_batch_costs(&lanes, |code| motor.cost(code).map(|value| value.upper_ms))?;
        let _cold_ms = started.elapsed().as_secs_f64() * 1_000.0;
        if cold_batch != expected {
            return Err(format!("cold CUDA batch mismatch for {}", mode_name(mode)));
        }

        let started = Instant::now();
        let (warm_batch, warm_timings) =
            plan.resolve_batch_costs(&lanes, |code| motor.cost(code).map(|value| value.upper_ms))?;
        let warm_ms = started.elapsed().as_secs_f64() * 1_000.0;
        if warm_batch != expected {
            return Err(format!("warm CUDA batch mismatch for {}", mode_name(mode)));
        }
        plan.resolve_batch(&lanes, |code| motor.cost(code).map(|value| value.upper_ms))?;
        let started = Instant::now();
        let (finalist_batch, finalist_timings) =
            plan.resolve_batch(&lanes, |code| motor.cost(code).map(|value| value.upper_ms))?;
        let finalist_ms = started.elapsed().as_secs_f64() * 1_000.0;
        if finalist_batch != expected {
            return Err(format!(
                "finalist CUDA batch mismatch for {}",
                mode_name(mode)
            ));
        }
        println!(
            "BATCH/{} sequential-fused={sequential_ms:.1}ms rank-only={rank_only_batch_ms:.1}ms fused={warm_ms:.1}ms finalists={finalist_ms:.1}ms finalist-vs-rank={:.2}x finalist-vs-fused={:.2}x launches={}->{} entries={} unique-codes={} finalists={} [device={:.1} prepare={:.1} finalize={:.1}] exact=yes",
            mode_name(mode),
            rank_only_batch_ms / finalist_ms,
            warm_ms / finalist_ms,
            BATCH_SIZE * cold_timings.launches,
            warm_timings.launches,
            warm_timings.entries,
            warm_timings.unique_codes,
            finalist_timings.finalists,
            finalist_timings.device.as_secs_f64() * 1_000.0,
            finalist_timings.preparation.as_secs_f64() * 1_000.0,
            finalist_timings.finalization.as_secs_f64() * 1_000.0,
        );
    }
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
            .map(|(donor, weight)| {
                let donor = donor.chars().next().ok_or("empty donor key")?;
                alphabet
                    .index_of(donor)
                    .ok_or_else(|| format!("unknown donor {donor:?}"))
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
