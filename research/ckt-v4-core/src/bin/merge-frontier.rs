use ckt_v4_core::{ExactFrontier, FrontierLogProvenance, FrontierPoint, read_frontier_log};
use serde::Serialize;
use std::env;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MergeOutput {
    version: &'static str,
    provenance: FrontierLogProvenance,
    input_records: usize,
    recovered_records: usize,
    deduplicated_records: usize,
    truncated_tail: bool,
    members: Vec<FrontierPoint>,
}

fn main() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let log = PathBuf::from(args.next().ok_or("usage: merge-frontier LOG OUTPUT")?);
    let output = PathBuf::from(args.next().ok_or("usage: merge-frontier LOG OUTPUT")?);
    if args.next().is_some() {
        return Err("usage: merge-frontier LOG OUTPUT".to_owned());
    }
    let recovered = read_frontier_log(&log)?;
    let mut frontier = ExactFrontier::with_schema(recovered.provenance.ergonomic_schema);
    for point in &recovered.points {
        frontier.insert(point.clone())?;
    }
    let result = MergeOutput {
        version: "ckt-v4-frontier-1",
        provenance: recovered.provenance,
        input_records: recovered.input_records,
        recovered_records: recovered.points.len(),
        deduplicated_records: recovered.duplicate_records,
        truncated_tail: recovered.truncated_tail,
        members: frontier.members().to_vec(),
    };
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let mut bytes = serde_json::to_vec_pretty(&result).map_err(|error| error.to_string())?;
    bytes.push(b'\n');
    fs::write(&output, bytes).map_err(|error| error.to_string())?;
    eprintln!(
        "merged {} records into {} exact members{}",
        result.recovered_records,
        result.members.len(),
        if result.truncated_tail {
            " (ignored truncated tail)"
        } else {
            ""
        }
    );
    Ok(())
}
