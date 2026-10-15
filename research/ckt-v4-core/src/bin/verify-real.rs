use ckt_v4_core::{
    CognitiveParameters, IncrementalResolver, KeyAlphabet, Kind, Pool, ProjectedMotor, Projection,
    RoleTables, Row, Stage, TrackSummary, resolve, summarize,
};
use serde::Deserialize;
use std::collections::HashMap;
use std::env;
use std::fs;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    version: String,
    key_alphabet: String,
    cognitive_parameters: CognitiveParameters,
    extension_maps: HashMap<String, Extension>,
    cases: Vec<Case>,
}

#[derive(Deserialize)]
struct Extension {
    donors: HashMap<String, f64>,
    distance_guard_multiplier: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Case {
    scheme_id: String,
    mode: String,
    rows: Vec<JsonRow>,
    expected_summary: HashMap<String, Option<TrackSummary>>,
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

fn close(actual: f64, expected: f64) -> bool {
    (actual - expected).abs() <= 1e-8_f64.max(expected.abs() * 1e-11)
}

fn compare_track(
    label: &str,
    actual: &TrackSummary,
    expected: &TrackSummary,
) -> Result<(), String> {
    if actual.count != expected.count {
        return Err(format!(
            "{label}/count: {} != {}",
            actual.count, expected.count
        ));
    }
    for (name, left, right) in [
        ("totalWeight", actual.total_weight, expected.total_weight),
        (
            "motorUpperMs",
            actual.motor_upper_ms,
            expected.motor_upper_ms,
        ),
        ("cognitiveMs", actual.cognitive_ms, expected.cognitive_ms),
        ("effectiveMs", actual.effective_ms, expected.effective_ms),
        (
            "firstAuxRate",
            actual.first_aux_rate,
            expected.first_aux_rate,
        ),
        (
            "secondAuxRate",
            actual.second_aux_rate,
            expected.second_aux_rate,
        ),
        (
            "selectionRate",
            actual.selection_rate,
            expected.selection_rate,
        ),
        (
            "meanTerminalRank",
            actual.mean_terminal_rank,
            expected.mean_terminal_rank,
        ),
        ("meanKeys", actual.mean_keys, expected.mean_keys),
    ] {
        if !close(left, right) {
            return Err(format!("{label}/{name}: {left:.15} != {right:.15}"));
        }
    }
    Ok(())
}

fn main() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let fixture_path = args.next().ok_or("usage: verify-real FIXTURE SNAPSHOT")?;
    let snapshot_path = args.next().ok_or("usage: verify-real FIXTURE SNAPSHOT")?;
    let incremental_smoke = match args.next().as_deref() {
        None => false,
        Some("--incremental-smoke") => true,
        Some(_) => {
            return Err("usage: verify-real FIXTURE SNAPSHOT [--incremental-smoke]".to_owned());
        }
    };
    if args.next().is_some() {
        return Err("usage: verify-real FIXTURE SNAPSHOT".to_owned());
    }
    let fixture: Fixture = serde_json::from_str(
        &fs::read_to_string(&fixture_path).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    if fixture.version != "ckt-v4-real-js-reference-1" {
        return Err(format!("unsupported fixture version {}", fixture.version));
    }
    let alphabet = KeyAlphabet::new(&fixture.key_alphabet)?;
    let native = RoleTables::from_snapshot_json(
        &alphabet,
        &fs::read_to_string(&snapshot_path).map_err(|error| error.to_string())?,
        0.0,
    )?;
    let mut projections = HashMap::new();
    for (key, extension) in fixture.extension_maps {
        let key = key.chars().next().ok_or("empty extension key")?;
        let global = alphabet
            .index_of(key)
            .ok_or_else(|| format!("unknown extension {key:?}"))?;
        let mut donors = Vec::with_capacity(extension.donors.len());
        for (donor, weight) in extension.donors {
            let donor = donor.chars().next().ok_or("empty donor key")?;
            donors.push((
                alphabet
                    .index_of(donor)
                    .ok_or_else(|| format!("unknown donor {donor:?}"))?,
                weight,
            ));
        }
        projections.insert(
            global,
            Projection {
                donors,
                distance_guard_multiplier: extension.distance_guard_multiplier,
            },
        );
    }
    let motor = ProjectedMotor::new(native, projections)?;
    let parameters = fixture.cognitive_parameters;
    for case in fixture.cases {
        let mut rows = Vec::with_capacity(case.rows.len());
        for row in case.rows {
            let mut stages = Vec::with_capacity(row.stages.len());
            for stage in row.stages {
                let mut codes: Vec<_> = stage
                    .codes
                    .iter()
                    .map(|code| alphabet.pack(code))
                    .collect::<Result<_, _>>()?;
                alphabet.sort_codes_js(&mut codes);
                codes.dedup();
                stages.push(Stage {
                    order: stage.order,
                    pool: Pool::parse(&stage.pool)?,
                    codes,
                });
            }
            rows.push(Row {
                id: row.id,
                text: row.text,
                kind: row.kind,
                weight: row.weight,
                base_length: row.base_length,
                stages,
            });
        }
        let outcomes = resolve(&rows, |code| motor.cost(code).map(|value| value.upper_ms))?;
        let summary = summarize(&rows, &outcomes, parameters)?;
        for (name, kind) in [
            ("character", Kind::Character),
            ("word2", Kind::Word2),
            ("word3", Kind::Word3),
            ("word4", Kind::Word4),
        ] {
            compare_track(
                &format!("{}/{}/{}", case.scheme_id, case.mode, name),
                summary
                    .track(kind)
                    .ok_or_else(|| format!("missing Rust track {name}"))?,
                case.expected_summary
                    .get(name)
                    .and_then(Option::as_ref)
                    .ok_or_else(|| format!("missing JS track {name}"))?,
            )?;
        }
        let row_count = rows.len();
        println!(
            "verified {}/{}: {} rows",
            case.scheme_id, case.mode, row_count
        );
        if incremental_smoke {
            let indices: Vec<_> = rows
                .iter()
                .enumerate()
                .filter_map(|(index, row)| (row.kind == Kind::Word2).then_some(index))
                .take(2)
                .collect();
            if indices.len() != 2 {
                return Err("real fixture has fewer than two word2 rows".to_owned());
            }
            let incremental_motor = motor.clone();
            let mut incremental = IncrementalResolver::new(rows, move |code| {
                incremental_motor.cost(code).map(|value| value.upper_ms)
            })?;
            let mut first = incremental.rows()[indices[0]].clone();
            let mut second = incremental.rows()[indices[1]].clone();
            std::mem::swap(&mut first.stages, &mut second.stages);
            let receipt =
                incremental.apply_updates(vec![(indices[0], first), (indices[1], second)])?;
            let affected = receipt.affected_rows;
            incremental.verify_against_full_recompute()?;
            incremental.rollback(receipt)?;
            incremental.verify_against_full_recompute()?;
            println!(
                "verified {}/{} incremental swap+rollback: {affected}/{row_count} affected rows",
                case.scheme_id, case.mode
            );
        }
    }
    Ok(())
}
