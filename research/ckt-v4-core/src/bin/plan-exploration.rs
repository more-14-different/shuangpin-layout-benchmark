use ckt_v4_core::{
    ExplorationArchive, ExplorationBatch, ExplorationConfig, read_frontier_log, update_and_plan,
};
use serde::Serialize;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

struct Args {
    archive: PathBuf,
    output_dir: PathBuf,
    generation: usize,
    logs: Vec<PathBuf>,
    config: ExplorationConfig,
}

fn main() -> Result<(), String> {
    let args = parse_args()?;
    let archive = if args.archive.exists() {
        let text = fs::read_to_string(&args.archive).map_err(|error| error.to_string())?;
        Some(serde_json::from_str::<ExplorationArchive>(&text).map_err(|error| error.to_string())?)
    } else {
        None
    };
    let mut batches = Vec::with_capacity(args.logs.len());
    for log in &args.logs {
        let recovered = read_frontier_log(log)?;
        batches.push(ExplorationBatch {
            source: log.display().to_string(),
            provenance: recovered.provenance,
            points: recovered.points,
        });
    }
    let (archive, plan) = update_and_plan(archive, batches, args.generation, args.config)?;
    let staging_dir = args.output_dir.with_extension("tmp");
    if args.output_dir.exists() || staging_dir.exists() {
        return Err(format!(
            "generation output or staging directory already exists: {} / {}",
            args.output_dir.display(),
            staging_dir.display()
        ));
    }
    fs::create_dir_all(&staging_dir).map_err(|error| error.to_string())?;
    write_json(&staging_dir.join("plan.json"), &plan)?;
    write_json(&staging_dir.join("review-queue.json"), &plan.review_queue)?;
    write_json(&staging_dir.join("archive-after.json"), &archive)?;
    for seed in &plan.seeds {
        let prefix: String = seed.state_key.chars().take(12).collect();
        let path = staging_dir.join(format!("seed-{:02}-{prefix}.json", seed.rank));
        write_json(&path, &seed.point.layout)?;
    }
    fs::rename(&staging_dir, &args.output_dir).map_err(|error| error.to_string())?;
    replace_json(&args.archive, &archive)?;
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
    let mut archive = None;
    let mut output_dir = None;
    let mut generation = None;
    let mut logs = Vec::new();
    let mut config = ExplorationConfig::default();
    while let Some(flag) = values.next() {
        match flag.as_str() {
            "--archive" => archive = Some(PathBuf::from(next(&mut values, &flag)?)),
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
        archive: archive.ok_or("--archive is required")?,
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

fn replace_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let temporary = path.with_extension("tmp");
    let mut bytes = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    bytes.push(b'\n');
    fs::write(&temporary, bytes).map_err(|error| error.to_string())?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    fs::rename(temporary, path).map_err(|error| error.to_string())
}
