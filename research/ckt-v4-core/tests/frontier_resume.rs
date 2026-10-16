use ckt_v4_core::{
    ExactFrontier, FrontierLogProvenance, FrontierLogWriter, FrontierMetrics, FrontierPoint,
    RegularLayout,
};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn temp_path(label: &str, extension: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "ckt-v4-{label}-{}-{nonce}.{extension}",
        std::process::id()
    ))
}

fn provenance() -> FrontierLogProvenance {
    FrontierLogProvenance {
        corpus_hash: "corpus".to_owned(),
        scheme_hash: "scheme".to_owned(),
        scheme_id: "resume".to_owned(),
        max_memory: None,
        max_displaced_initials: None,
        max_displaced_vowels: None,
        proposal_policy: "regular-compound-v1".to_owned(),
    }
}

fn point(iteration: usize) -> FrontierPoint {
    let marker = (iteration % 20) as u8;
    let mut head_keys: Vec<_> = (0..27).map(|index| (index % 21) as u8).collect();
    head_keys.swap(0, usize::from(marker) + 1);
    FrontierPoint {
        metrics: FrontierMetrics {
            ckt_v4: 10.0 - iteration as f64 / 100.0,
            memory: 30 + iteration % 4,
            displaced_initials: 2 + iteration % 3,
            displaced_vowels: iteration % 2,
        },
        layout: RegularLayout {
            id: "resume".to_owned(),
            capacity: [21, 21],
            head_keys,
            final_keys: (0..35).map(|index| (index % 21) as u8).collect(),
            tone: [21, 22, 23, 24, 25],
        },
        iteration,
    }
}

fn append(path: &Path, range: std::ops::Range<usize>) {
    let mut writer = FrontierLogWriter::open(path, provenance()).unwrap();
    for iteration in range {
        writer.append(&point(iteration)).unwrap();
    }
}

fn merge(log: &Path, output: &Path) {
    let status = Command::new(env!("CARGO_BIN_EXE_merge-frontier"))
        .arg(log)
        .arg(output)
        .status()
        .unwrap();
    assert!(status.success());
}

#[test]
fn split_resume_and_continuous_logs_merge_to_identical_bytes() {
    let continuous_log = temp_path("continuous", "jsonl");
    let resumed_log = temp_path("resumed", "jsonl");
    let continuous_output = temp_path("continuous-frontier", "json");
    let resumed_output = temp_path("resumed-frontier", "json");

    append(&continuous_log, 0..40);
    append(&resumed_log, 0..17);
    append(&resumed_log, 17..40);
    merge(&continuous_log, &continuous_output);
    merge(&resumed_log, &resumed_output);
    assert_eq!(
        fs::read(&continuous_output).unwrap(),
        fs::read(&resumed_output).unwrap()
    );

    let mut leaders = ExactFrontier::new();
    for iteration in 0..40 {
        leaders.insert(point(iteration)).unwrap();
    }
    assert!(leaders.members().len() < 40);

    for path in [
        continuous_log,
        resumed_log,
        continuous_output,
        resumed_output,
    ] {
        fs::remove_file(path).unwrap();
    }
}
