use approx::assert_abs_diff_eq;
use ckt_v4_core::{
    CognitiveParameters, IncrementalResolver, KeyAlphabet, Kind, Pool, Row, Stage, TrackSummary,
    resolve, summarize,
};
use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    version: String,
    source: String,
    key_alphabet: String,
    cognitive_parameters: CognitiveParameters,
    cases: Vec<Case>,
}

#[derive(Deserialize)]
struct Case {
    name: String,
    contract: String,
    rows: Vec<JsonRow>,
    expected: Expected,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsonRow {
    id: String,
    text: String,
    kind: Kind,
    weight: f64,
    base_length: u8,
    stages: Vec<JsonStage>,
}

#[derive(Deserialize)]
struct JsonStage {
    order: u8,
    pool: String,
    codes: Vec<String>,
}

#[derive(Deserialize)]
struct Expected {
    outcomes: Vec<ExpectedOutcome>,
    summary: HashMap<String, Option<TrackSummary>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExpectedOutcome {
    id: String,
    code: String,
    code_length: u8,
    aux_count: u8,
    rank: usize,
    pool: String,
    motor_upper_ms: f64,
}

fn fixture() -> Fixture {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join("tests/fixtures/ckt_v4_kernel_reference.json");
    serde_json::from_str(&fs::read_to_string(path).expect("run `just ckt-v4-fixture` first"))
        .expect("valid JS reference fixture")
}

fn rows(case: &Case, alphabet: &KeyAlphabet) -> Vec<Row> {
    case.rows
        .iter()
        .map(|row| Row {
            id: row.id.clone(),
            text: row.text.clone(),
            kind: row.kind,
            weight: row.weight,
            base_length: row.base_length,
            stages: row
                .stages
                .iter()
                .map(|stage| Stage {
                    order: stage.order,
                    pool: Pool::parse(&stage.pool).unwrap(),
                    codes: stage
                        .codes
                        .iter()
                        .map(|code| alphabet.pack(code).unwrap())
                        .collect(),
                })
                .collect(),
        })
        .collect()
}

fn expected_track<'a>(case: &'a Case, kind: &str) -> &'a TrackSummary {
    case.expected.summary.get(kind).unwrap().as_ref().unwrap()
}

fn compare_track(actual: &TrackSummary, expected: &TrackSummary) {
    assert_eq!(actual.count, expected.count);
    assert_abs_diff_eq!(actual.total_weight, expected.total_weight, epsilon = 1e-12);
    assert_abs_diff_eq!(
        actual.motor_upper_ms,
        expected.motor_upper_ms,
        epsilon = 1e-12
    );
    assert_abs_diff_eq!(actual.cognitive_ms, expected.cognitive_ms, epsilon = 1e-12);
    assert_abs_diff_eq!(actual.effective_ms, expected.effective_ms, epsilon = 1e-12);
    assert_abs_diff_eq!(
        actual.first_aux_rate,
        expected.first_aux_rate,
        epsilon = 1e-12
    );
    assert_abs_diff_eq!(
        actual.second_aux_rate,
        expected.second_aux_rate,
        epsilon = 1e-12
    );
    assert_abs_diff_eq!(
        actual.selection_rate,
        expected.selection_rate,
        epsilon = 1e-12
    );
    assert_abs_diff_eq!(
        actual.mean_terminal_rank,
        expected.mean_terminal_rank,
        epsilon = 1e-12
    );
    assert_abs_diff_eq!(actual.mean_keys, expected.mean_keys, epsilon = 1e-12);
}

#[test]
fn rust_matches_js_outcomes_and_all_four_tracks_for_both_contracts() {
    let fixture = fixture();
    assert_eq!(fixture.version, "ckt-v4-js-reference-1");
    assert_eq!(fixture.source, "tools/ckt_v4_model.js");
    let alphabet = KeyAlphabet::new(&fixture.key_alphabet).unwrap();

    for case in &fixture.cases {
        assert!(matches!(
            case.contract.as_str(),
            "traditional-21x21" | "four-code-top"
        ));
        let rows = rows(case, &alphabet);
        let outcomes = resolve(&rows, |code| Some(code.len() as f64 * 100.0)).unwrap();
        assert_eq!(
            outcomes.len(),
            case.expected.outcomes.len(),
            "{}",
            case.name
        );
        for (actual, expected) in outcomes.iter().zip(&case.expected.outcomes) {
            assert_eq!(rows[actual.row_index].id, expected.id, "{}", case.name);
            assert_eq!(alphabet.unpack(actual.code), expected.code, "{}", case.name);
            assert_eq!(actual.code_length, expected.code_length, "{}", case.name);
            assert_eq!(actual.aux_count, expected.aux_count, "{}", case.name);
            assert_eq!(actual.rank, expected.rank, "{}", case.name);
            assert_eq!(actual.pool.as_str(), expected.pool, "{}", case.name);
            assert_abs_diff_eq!(
                actual.motor_upper_ms,
                expected.motor_upper_ms,
                epsilon = 1e-12
            );
        }
        let summary = summarize(&rows, &outcomes, fixture.cognitive_parameters).unwrap();
        compare_track(
            summary.track(Kind::Character).unwrap(),
            expected_track(case, "character"),
        );
        compare_track(
            summary.track(Kind::Word2).unwrap(),
            expected_track(case, "word2"),
        );
        compare_track(
            summary.track(Kind::Word3).unwrap(),
            expected_track(case, "word3"),
        );
        compare_track(
            summary.track(Kind::Word4).unwrap(),
            expected_track(case, "word4"),
        );
    }
}

#[test]
fn incremental_component_update_and_rollback_equal_full_recomputation() {
    let fixture = fixture();
    let alphabet = KeyAlphabet::new(&fixture.key_alphabet).unwrap();
    let case = fixture
        .cases
        .iter()
        .find(|case| case.name == "traditional-21x21-joint-pool")
        .unwrap();
    let rows = rows(case, &alphabet);
    let original = rows.clone();
    let changed_index = rows.iter().position(|row| row.id == "w4-light").unwrap();
    let mut changed = rows[changed_index].clone();
    changed.stages[0].codes = vec![alphabet.pack("QRST").unwrap()];
    changed.stages[1].codes = vec![alphabet.pack("QRSTI").unwrap()];
    changed.stages[2].codes = vec![alphabet.pack("QRSTIE").unwrap()];

    let mut incremental =
        IncrementalResolver::new(rows, |code| Some(code.len() as f64 * 100.0)).unwrap();
    let receipt = incremental
        .apply_updates(vec![(changed_index, changed)])
        .unwrap();
    assert!(receipt.affected_rows < incremental.rows().len());
    incremental.verify_against_full_recompute().unwrap();

    incremental.rollback(receipt).unwrap();
    incremental.verify_against_full_recompute().unwrap();
    assert_eq!(incremental.rows(), original);
}
