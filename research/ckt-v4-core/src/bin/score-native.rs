use ckt_v4_core::{
    CognitiveParameters, InputMode, KeyAlphabet, Kind, NativeCorpus, ProjectedMotor, Projection,
    RoleTables, SchemeFixture, SchemeState, Summary, composite_score, resolve, summarize,
};
use std::collections::HashMap;
use std::env;
use std::fs;

fn main() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let corpus_path = args
        .next()
        .ok_or("usage: score-native CORPUS SCHEMES SNAPSHOT")?;
    let schemes_path = args
        .next()
        .ok_or("usage: score-native CORPUS SCHEMES SNAPSHOT")?;
    let snapshot_path = args
        .next()
        .ok_or("usage: score-native CORPUS SCHEMES SNAPSHOT")?;
    if args.next().is_some() {
        return Err("usage: score-native CORPUS SCHEMES SNAPSHOT".to_owned());
    }

    let corpus = NativeCorpus::open(corpus_path)?;
    let fixture = SchemeFixture::open(schemes_path)?;
    if fixture.key_alphabet != corpus.header().key_alphabet
        || fixture.source_hashes.get("html") != corpus.header().source_hashes.get("html")
    {
        return Err("scheme/native-corpus provenance differs".to_owned());
    }
    let alphabet = KeyAlphabet::new(&corpus.header().key_alphabet)?;
    let native = RoleTables::from_snapshot_json(
        &alphabet,
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
    let motor = ProjectedMotor::new(native, projections)?;
    let mut all_summaries: Vec<(String, Vec<Summary>)> = Vec::new();
    for input in &fixture.schemes {
        let scheme = SchemeState::compile(input, &alphabet, corpus.header().pinyin_count)?;
        let mut modes = Vec::new();
        for (name, mode) in [("keytao", InputMode::Keytao), ("sanpin", InputMode::Sanpin)] {
            let generated = corpus.generate(&scheme, mode)?;
            let outcomes = resolve(&generated.rows, |code| {
                motor.cost(code).map(|value| value.upper_ms)
            })?;
            let summary = summarize(&generated.rows, &outcomes, CognitiveParameters::default())?;
            let tracks = Kind::ALL.map(|kind| {
                summary
                    .track(kind)
                    .map(|track| track.effective_ms)
                    .unwrap_or(f64::NAN)
            });
            println!(
                "scored {}/{}: {} rows, effective_ms=[{:.6}, {:.6}, {:.6}, {:.6}]",
                scheme.id,
                name,
                generated.rows.len(),
                tracks[0],
                tracks[1],
                tracks[2],
                tracks[3]
            );
            modes.push(summary);
        }
        all_summaries.push((scheme.id, modes));
    }
    let reference = all_summaries
        .first()
        .ok_or("scheme fixture is empty")?
        .1
        .clone();
    for (id, modes) in &all_summaries {
        println!("composite {id}: {:.9}", composite_score(modes, &reference)?);
    }
    Ok(())
}
