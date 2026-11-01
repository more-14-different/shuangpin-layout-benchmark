use ckt_v4_core::{
    EXPLORATION_DATABASE_VERSION, ExplorationBatch, ExplorationConfig, ExplorationDatabase,
    read_frontier_log,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

struct Args {
    database: PathBuf,
    output_dir: PathBuf,
    generation: usize,
    logs: Vec<PathBuf>,
    config: ExplorationConfig,
}

fn main() -> Result<(), String> {
    let args = parse_args()?;
    let request_signature = request_signature(&args)?;
    let mut batches = Vec::with_capacity(args.logs.len());
    for log in &args.logs {
        let recovered = read_frontier_log(log)?;
        batches.push(ExplorationBatch {
            source: log.display().to_string(),
            provenance: recovered.provenance,
            points: recovered.points,
        });
    }
    let mut database = ExplorationDatabase::open(&args.database)?;
    let plan =
        database.plan_generation(batches, args.generation, args.config, &request_signature)?;
    if args.output_dir.exists() {
        let saved = fs::read_to_string(args.output_dir.join("plan.json"))
            .map_err(|error| error.to_string())?;
        let saved_plan: ckt_v4_core::ExplorationPlan =
            serde_json::from_str(&saved).map_err(|error| error.to_string())?;
        if saved_plan == plan {
            return Ok(());
        }
        return Err(format!(
            "generation output already exists with different contents: {}",
            args.output_dir.display()
        ));
    }
    let staging_dir = args
        .output_dir
        .with_extension(format!("tmp-{}", std::process::id()));
    if staging_dir.exists() {
        return Err(format!(
            "generation staging directory already exists: {}",
            staging_dir.display()
        ));
    }
    fs::create_dir_all(&staging_dir).map_err(|error| error.to_string())?;
    write_json(&staging_dir.join("plan.json"), &plan)?;
    write_json(&staging_dir.join("review-queue.json"), &plan.review_queue)?;
    write_json(
        &staging_dir.join("database-state.json"),
        &serde_json::json!({
            "version": EXPLORATION_DATABASE_VERSION,
            "generation": plan.generation,
            "totalStates": plan.total_states,
        }),
    )?;
    for seed in &plan.seeds {
        let prefix: String = seed.state_key.chars().take(12).collect();
        let path = staging_dir.join(format!("seed-{:02}-{prefix}.json", seed.rank));
        write_json(&path, &seed.point.layout)?;
    }
    fs::rename(&staging_dir, &args.output_dir).map_err(|error| error.to_string())?;
    eprintln!(
        "planned generation {}: imported {} new states, archived {}, selected {} seeds, queued {} reviews",
        plan.generation,
        plan.imported_new_states,
        plan.total_states,
        plan.seeds.len(),
        plan.review_queue.len()
    );
    Ok(())
}

fn parse_args() -> Result<Args, String> {
    let mut values = env::args().skip(1);
    let mut database = None;
    let mut output_dir = None;
    let mut generation = None;
    let mut logs = Vec::new();
    let mut config = ExplorationConfig::default();
    while let Some(flag) = values.next() {
        match flag.as_str() {
            "--database" => database = Some(PathBuf::from(next(&mut values, &flag)?)),
            "--output-dir" => output_dir = Some(PathBuf::from(next(&mut values, &flag)?)),
            "--generation" => generation = Some(parse(next(&mut values, &flag)?, &flag)?),
            "--log" => logs.push(PathBuf::from(next(&mut values, &flag)?)),
            "--seeds" => config.seed_count = parse(next(&mut values, &flag)?, &flag)?,
            "--max-ckt-delta" => config.max_ckt_delta = parse(next(&mut values, &flag)?, &flag)?,
            "--novelty-distance" => {
                config.novelty_distance = parse(next(&mut values, &flag)?, &flag)?
            }
            "--basin-radius" => config.basin_radius = parse(next(&mut values, &flag)?, &flag)?,
            "--basin-support" => config.basin_support = parse(next(&mut values, &flag)?, &flag)?,
            _ => return Err(format!("unknown option {flag}")),
        }
    }
    if logs.is_empty() {
        return Err("at least one --log is required".to_owned());
    }
    Ok(Args {
        database: database.ok_or("--database is required")?,
        output_dir: output_dir.ok_or("--output-dir is required")?,
        generation: generation.ok_or("--generation is required")?,
        logs,
        config,
    })
}

fn next(values: &mut impl Iterator<Item = String>, flag: &str) -> Result<String, String> {
    values.next().ok_or_else(|| format!("{flag} needs a value"))
}

fn parse<T: std::str::FromStr>(value: String, flag: &str) -> Result<T, String> {
    value
        .parse()
        .map_err(|_| format!("invalid value for {flag}"))
}

fn write_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    if path.exists() {
        return Err(format!("refusing to overwrite {}", path.display()));
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let mut bytes = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    bytes.push(b'\n');
    fs::write(path, bytes).map_err(|error| error.to_string())
}

fn request_signature(args: &Args) -> Result<String, String> {
    let mut hash = Sha256::new();
    let mut feed = |bytes: &[u8]| {
        hash.update((bytes.len() as u64).to_le_bytes());
        hash.update(bytes);
    };
    feed(&args.generation.to_le_bytes());
    feed(&args.config.seed_count.to_le_bytes());
    feed(&args.config.max_ckt_delta.to_bits().to_le_bytes());
    feed(&args.config.novelty_distance.to_le_bytes());
    feed(&args.config.basin_radius.to_le_bytes());
    feed(&args.config.basin_support.to_le_bytes());
    for log in &args.logs {
        feed(log.as_os_str().to_string_lossy().as_bytes());
        feed(&[0]);
        feed(&fs::read(log).map_err(|error| error.to_string())?);
        feed(&[0xff]);
    }
    let digest: String = hash
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    Ok(format!("sha256:{digest}"))
}
