use ckt_v4_core::{
    FrontierLogProvenance, FrontierLogWriter, FrontierMetrics, FrontierPoint, RegularLayout,
    read_frontier_log,
};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn temp_path(label: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "ckt-v4-{label}-{}-{nonce}.jsonl",
        std::process::id()
    ))
}

fn provenance(scheme: &str) -> FrontierLogProvenance {
    FrontierLogProvenance {
        corpus_hash: "corpus-sha256".to_owned(),
        scheme_hash: "html-sha256".to_owned(),
        scheme_id: scheme.to_owned(),
        max_memory: Some(40),
        max_displaced_initials: None,
        max_displaced_vowels: Some(1),
        proposal_policy: "regular-compound-v1".to_owned(),
    }
}

fn point(iteration: usize) -> FrontierPoint {
    FrontierPoint {
        metrics: FrontierMetrics {
            ckt_v4: 10.0 - iteration as f64 / 100.0,
            memory: 40 + iteration,
            displaced_initials: 3,
            displaced_vowels: 1,
        },
        layout: RegularLayout {
            id: "seed".to_owned(),
            capacity: [21, 21],
            head_keys: (0..27).map(|index| (index % 21) as u8).collect(),
            final_keys: (0..35).map(|index| (index % 21) as u8).collect(),
            tone: [21, 22, 23, 24, 25],
        },
        iteration,
    }
}

#[test]
fn log_round_trips_in_order_and_suppresses_exact_replays() {
    let path = temp_path("roundtrip");
    {
        let mut writer = FrontierLogWriter::open(&path, provenance("S005-NF")).unwrap();
        writer.append(&point(1)).unwrap();
        writer.append(&point(2)).unwrap();
        writer.append(&point(1)).unwrap();
    }
    let recovered = read_frontier_log(&path).unwrap();
    assert_eq!(recovered.provenance, provenance("S005-NF"));
    assert_eq!(recovered.input_records, 3);
    assert_eq!(recovered.duplicate_records, 1);
    assert_eq!(recovered.points, vec![point(1), point(2)]);
    assert!(!recovered.truncated_tail);
    fs::remove_file(path).unwrap();
}

#[test]
fn reopening_with_different_provenance_fails() {
    let path = temp_path("provenance");
    drop(FrontierLogWriter::open(&path, provenance("A")).unwrap());
    let error = FrontierLogWriter::open(&path, provenance("B")).unwrap_err();
    assert!(error.contains("provenance"));
    fs::remove_file(path).unwrap();
}

#[test]
fn one_truncated_tail_is_ignored_but_complete_corruption_fails() {
    let path = temp_path("truncated");
    {
        let mut writer = FrontierLogWriter::open(&path, provenance("A")).unwrap();
        writer.append(&point(1)).unwrap();
    }
    OpenOptions::new()
        .append(true)
        .open(&path)
        .unwrap()
        .write_all(br#"{"kind":"point","point":{"metrics": "#)
        .unwrap();
    let recovered = read_frontier_log(&path).unwrap();
    assert_eq!(recovered.points, vec![point(1)]);
    assert!(recovered.truncated_tail);

    fs::write(&path, "not-json\n").unwrap();
    assert!(read_frontier_log(&path).is_err());
    fs::remove_file(path).unwrap();
}
