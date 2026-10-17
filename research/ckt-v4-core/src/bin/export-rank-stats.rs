use ckt_v4_core::{
    CognitiveParameters, InputMode, Kind, NativeCorpus, Outcome, Row, SchemeFixture, SchemeState,
    audit_fixture, resolve,
};
use serde::Serialize;
use std::collections::BTreeMap;
use std::env;
use std::fs;

#[derive(Clone, Copy, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct RankStats {
    mean_terminal_rank: f64,
    mean_rejected_candidates: f64,
    mean_page_actions: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Output {
    version: &'static str,
    page_size: usize,
    offset: usize,
    limit: usize,
    total_schemes: usize,
    source_hashes: BTreeMap<String, String>,
    skipped: BTreeMap<String, String>,
    schemes: BTreeMap<String, BTreeMap<String, BTreeMap<String, RankStats>>>,
}

fn summarize_rank(rows: &[Row], outcomes: &[Outcome], page_size: usize) -> [RankStats; 4] {
    let mut totals = [0.0_f64; 4];
    let mut ranks = [0.0_f64; 4];
    let mut rejected = [0.0_f64; 4];
    let mut pages = [0.0_f64; 4];
    for outcome in outcomes {
        let row = &rows[outcome.row_index];
        let index = row.kind.index();
        totals[index] += row.weight;
        ranks[index] += row.weight * outcome.rank as f64;
        rejected[index] += row.weight * outcome.rank.saturating_sub(1) as f64;
        pages[index] += row.weight * (outcome.rank.saturating_sub(1) / page_size) as f64;
    }
    Kind::ALL.map(|kind| {
        let index = kind.index();
        RankStats {
            mean_terminal_rank: ranks[index] / totals[index],
            mean_rejected_candidates: rejected[index] / totals[index],
            mean_page_actions: pages[index] / totals[index],
        }
    })
}

fn main() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let corpus_path = args
        .next()
        .ok_or("usage: export-rank-stats CORPUS SCHEMES OUTPUT [OFFSET LIMIT]")?;
    let schemes_path = args
        .next()
        .ok_or("usage: export-rank-stats CORPUS SCHEMES OUTPUT [OFFSET LIMIT]")?;
    let output_path = args
        .next()
        .ok_or("usage: export-rank-stats CORPUS SCHEMES OUTPUT [OFFSET LIMIT]")?;
    let offset = args
        .next()
        .map(|value| value.parse::<usize>().map_err(|error| error.to_string()))
        .transpose()?
        .unwrap_or(0);
    let requested_limit = args
        .next()
        .map(|value| value.parse::<usize>().map_err(|error| error.to_string()))
        .transpose()?
        .unwrap_or(usize::MAX);
    if args.next().is_some() {
        return Err("usage: export-rank-stats CORPUS SCHEMES OUTPUT [OFFSET LIMIT]".to_owned());
    }

    let corpus = NativeCorpus::open(corpus_path)?;
    let fixture = SchemeFixture::open(schemes_path)?;
    if fixture.key_alphabet != corpus.header().key_alphabet
        || fixture.source_hashes.get("html") != corpus.header().source_hashes.get("html")
    {
        return Err("scheme/native-corpus provenance differs".to_owned());
    }
    let alphabet = ckt_v4_core::KeyAlphabet::new(&corpus.header().key_alphabet)?;
    let page_size = CognitiveParameters::default().page_size.max(2);
    let total_schemes = fixture.schemes.len();
    if offset > total_schemes {
        return Err(format!("offset {offset} exceeds {total_schemes} schemes"));
    }
    let limit = requested_limit.min(total_schemes - offset);
    let capability = audit_fixture(&fixture)?;
    let forward = capability
        .schemes
        .into_iter()
        .map(|row| (row.id, (row.forward_score, row.detail)))
        .collect::<BTreeMap<_, _>>();
    let mut schemes = BTreeMap::new();
    let mut skipped = BTreeMap::new();
    for input in fixture.schemes.iter().skip(offset).take(limit) {
        let (forward_score, detail) = forward
            .get(&input.id)
            .ok_or_else(|| format!("missing capability for {}", input.id))?;
        if !forward_score {
            skipped.insert(input.id.clone(), detail.clone());
            continue;
        }
        let scheme = SchemeState::compile(input, &alphabet, corpus.header().pinyin_count)?;
        let mut modes = BTreeMap::new();
        for (name, mode) in [("keytao", InputMode::Keytao), ("sanpin", InputMode::Sanpin)] {
            let generated = corpus.generate(&scheme, mode)?;
            let outcomes = resolve(&generated.rows, |code| Some(code.len() as f64))?;
            let tracks = summarize_rank(&generated.rows, &outcomes, page_size);
            modes.insert(
                name.to_owned(),
                BTreeMap::from_iter(Kind::ALL.into_iter().zip(tracks).map(|(kind, stats)| {
                    let name = match kind {
                        Kind::Character => "character",
                        Kind::Word2 => "word2",
                        Kind::Word3 => "word3",
                        Kind::Word4 => "word4",
                    };
                    (name.to_owned(), stats)
                })),
            );
        }
        schemes.insert(scheme.id, modes);
    }
    eprintln!(
        "rank stats: range {}..{} of {} schemes",
        offset,
        offset + limit,
        total_schemes
    );
    let source_hashes = corpus
        .header()
        .source_hashes
        .iter()
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();
    let output = Output {
        version: "ckt-v4-rank-stats-1",
        page_size,
        offset,
        limit,
        total_schemes,
        source_hashes,
        skipped,
        schemes,
    };
    fs::write(
        output_path,
        format!(
            "{}\n",
            serde_json::to_string_pretty(&output).map_err(|error| error.to_string())?
        ),
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}
