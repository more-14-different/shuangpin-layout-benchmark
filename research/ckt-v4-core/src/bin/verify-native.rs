use ckt_v4_core::{
    BinaryFixture, CognitiveParameters, IncrementalResolver, IncrementalSummary, InputMode,
    KeyAlphabet, Kind, NativeCorpus, ProjectedMotor, Projection, RoleTables, SchemeFixture,
    SchemeState, Summary, summarize,
};
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::time::Instant;

fn main() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let corpus_path = args
        .next()
        .ok_or("usage: verify-native CORPUS SCHEMES ROW_FIXTURE SNAPSHOT [--incremental-smoke]")?;
    let schemes_path = args
        .next()
        .ok_or("usage: verify-native CORPUS SCHEMES ROW_FIXTURE SNAPSHOT [--incremental-smoke]")?;
    let rows_path = args
        .next()
        .ok_or("usage: verify-native CORPUS SCHEMES ROW_FIXTURE SNAPSHOT [--incremental-smoke]")?;
    let snapshot_path = args
        .next()
        .ok_or("usage: verify-native CORPUS SCHEMES ROW_FIXTURE SNAPSHOT [--incremental-smoke]")?;
    let incremental_smoke = match args.next().as_deref() {
        None => false,
        Some("--incremental-smoke") => true,
        Some(_) => {
            return Err(
                "usage: verify-native CORPUS SCHEMES ROW_FIXTURE SNAPSHOT [--incremental-smoke]"
                    .to_owned(),
            );
        }
    };
    if args.next().is_some() {
        return Err(
            "usage: verify-native CORPUS SCHEMES ROW_FIXTURE SNAPSHOT [--incremental-smoke]"
                .to_owned(),
        );
    }

    let corpus = NativeCorpus::open(corpus_path)?;
    let schemes = SchemeFixture::open(schemes_path)?;
    if schemes.key_alphabet != corpus.header().key_alphabet {
        return Err("scheme/native-corpus alphabets differ".to_owned());
    }
    if schemes.source_hashes.get("html") != corpus.header().source_hashes.get("html") {
        return Err("scheme/native-corpus HTML hashes differ".to_owned());
    }
    let alphabet = KeyAlphabet::new(&corpus.header().key_alphabet)?;
    let compiled: HashMap<_, _> = schemes
        .schemes
        .iter()
        .map(|input| {
            let scheme = match schemes.compile_layout(input, &alphabet) {
                Ok(layout) => {
                    println!("reconstructed regular state for {}", input.id);
                    schemes.scheme_state(&layout)?
                }
                Err(reason) => {
                    println!("using direct state for non-regular {}: {reason}", input.id);
                    SchemeState::compile(input, &alphabet, corpus.header().pinyin_count)?
                }
            };
            Ok::<_, String>((scheme.id.clone(), scheme))
        })
        .collect::<Result<_, _>>()?;

    let mut fixture = BinaryFixture::open(rows_path)?;
    let fixture_header = fixture.header().clone();
    if fixture_header.key_alphabet != corpus.header().key_alphabet
        || fixture_header.source_hashes.get("html") != corpus.header().source_hashes.get("html")
    {
        return Err("native corpus and frozen row fixture provenance differ".to_owned());
    }
    let native = RoleTables::from_snapshot_json(
        &alphabet,
        &fs::read_to_string(snapshot_path).map_err(|error| error.to_string())?,
        0.0,
    )?;
    let mut projections = HashMap::new();
    for (key, extension) in fixture_header.extension_maps {
        let key = key.chars().next().ok_or("empty extension key")?;
        let global = alphabet
            .index_of(key)
            .ok_or_else(|| format!("unknown extension {key:?}"))?;
        let donors = extension
            .donors
            .into_iter()
            .map(|(donor, weight)| {
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
    let motor = ProjectedMotor::new(native, projections)?;

    while let Some(reference) = fixture.next_case()? {
        let scheme = compiled
            .get(&reference.scheme_id)
            .ok_or_else(|| format!("missing scheme state {}", reference.scheme_id))?;
        let mode = InputMode::parse(&reference.mode)?;
        let generated = corpus.generate(scheme, mode)?;
        if generated.rows.len() != reference.rows.len() {
            return Err(format!(
                "{}/{} row count: native {} != frozen {}",
                reference.scheme_id,
                reference.mode,
                generated.rows.len(),
                reference.rows.len()
            ));
        }
        if let Some((index, (actual, expected))) = generated
            .rows
            .iter()
            .zip(&reference.rows)
            .enumerate()
            .find(|(_, (actual, expected))| actual != expected)
        {
            return Err(format!(
                "{}/{} row {index} differs: native={} frozen={} native={actual:?} frozen={expected:?}",
                reference.scheme_id, reference.mode, actual.id, expected.id
            ));
        }
        if generated.dependencies.row_count() != generated.rows.len() {
            return Err("dependency index row count differs".to_owned());
        }
        println!(
            "verified native {}/{}: {} rows exactly equal",
            reference.scheme_id,
            reference.mode,
            generated.rows.len()
        );

        if incremental_smoke {
            verify_incremental_swap(&corpus, scheme, mode, generated, motor.clone())?;
        }
    }
    Ok(())
}

fn verify_incremental_swap(
    corpus: &NativeCorpus,
    original: &SchemeState,
    mode: InputMode,
    generated: ckt_v4_core::GeneratedRows,
    motor: ProjectedMotor,
) -> Result<(), String> {
    let mut candidates: Vec<_> = generated
        .dependencies
        .by_pinyin
        .iter()
        .enumerate()
        .filter_map(|(index, rows)| (!rows.is_empty()).then_some((rows.len(), index)))
        .collect();
    candidates.sort_unstable();
    let (_, left) = *candidates
        .first()
        .ok_or("no pinyin dependency candidates")?;
    let (_, right) = *candidates
        .iter()
        .find(|(_, index)| *index != left)
        .ok_or("only one pinyin dependency candidate")?;
    let mut changed = original.clone();
    changed.swap_pinyin_codes(left, right)?;
    let affected = generated.dependencies.affected_rows(original, &changed)?;
    let affected_set: HashSet<_> = affected.iter().copied().collect();
    let update_started = Instant::now();
    let updates = corpus.generate_updates(&changed, mode, &generated.dependencies, &affected)?;
    let update_elapsed = update_started.elapsed();
    let replacement = corpus.generate(&changed, mode)?;
    if replacement.rows.len() != generated.rows.len() {
        return Err("fixed-topology swap changed row count".to_owned());
    }
    for index in 0..generated.rows.len() {
        if !affected_set.contains(&index) && generated.rows[index] != replacement.rows[index] {
            return Err(format!("dependency index missed changed row {index}"));
        }
    }
    for (index, row) in &updates {
        if row != &replacement.rows[*index] {
            return Err(format!("direct regeneration differs at row {index}"));
        }
    }
    let incremental_motor = motor.clone();
    let mut resolver = IncrementalResolver::new(generated.rows, move |code| {
        incremental_motor.cost(code).map(|value| value.upper_ms)
    })?;
    let parameters = CognitiveParameters::default();
    let mut summary = IncrementalSummary::new(resolver.rows(), resolver.outcomes(), parameters)?;
    let receipt = resolver.apply_updates(updates)?;
    summary.apply_changes(resolver.rows(), receipt.outcome_changes())?;
    compare_summaries(
        &summary.summary(),
        &summarize(resolver.rows(), resolver.outcomes(), parameters)?,
    )?;
    resolver.verify_against_full_recompute()?;
    if resolver.rows() != replacement.rows {
        return Err("incremental rows differ from native full regeneration".to_owned());
    }
    let directly_changed = affected.len();
    let collision_component = receipt.affected_rows;
    let rollback = resolver.rollback(receipt)?;
    summary.apply_changes(resolver.rows(), rollback.outcome_changes())?;
    compare_summaries(
        &summary.summary(),
        &summarize(resolver.rows(), resolver.outcomes(), parameters)?,
    )?;
    resolver.verify_against_full_recompute()?;
    println!(
        "verified native pinyin swap {left}<->{right}: {directly_changed} direct rows in {:.3} ms, {collision_component} collision-component rows",
        update_elapsed.as_secs_f64() * 1000.0
    );
    Ok(())
}

fn compare_summaries(left: &Summary, right: &Summary) -> Result<(), String> {
    for kind in Kind::ALL {
        let left = left
            .track(kind)
            .ok_or("incremental summary misses a track")?;
        let right = right.track(kind).ok_or("full summary misses a track")?;
        if left.count != right.count {
            return Err(format!("incremental summary count differs for {kind:?}"));
        }
        for (a, b) in [
            (left.total_weight, right.total_weight),
            (left.motor_upper_ms, right.motor_upper_ms),
            (left.cognitive_ms, right.cognitive_ms),
            (left.effective_ms, right.effective_ms),
            (left.first_aux_rate, right.first_aux_rate),
            (left.second_aux_rate, right.second_aux_rate),
            (left.selection_rate, right.selection_rate),
            (left.mean_terminal_rank, right.mean_terminal_rank),
            (left.mean_keys, right.mean_keys),
        ] {
            if (a - b).abs() > 1e-8_f64.max(b.abs() * 1e-11) {
                return Err(format!(
                    "incremental summary differs for {kind:?}: {a} != {b}"
                ));
            }
        }
    }
    Ok(())
}
