use ckt_v4_core::{
    CognitiveParameters, IncrementalResolver, IncrementalSummary, InputMode, KeyAlphabet, Kind,
    NativeCorpus, ProjectedMotor, Projection, RoleTables, SchemeState, Summary,
};
use serde::Deserialize;
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::{Path, PathBuf};

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrialFixture {
    version: String,
    layout_id: String,
    key_alphabet: String,
    tone_keys_by_tone: String,
    sound_keys: String,
    baseline_memory_lower: usize,
    baseline_memory_guard: usize,
    baseline_tone_region_merge_lower: usize,
    expected: Expected,
    reference_effective_ms: [f64; 4],
    pinyin: Vec<String>,
    toned_codes: Vec<[Option<String>; 5]>,
    atoms: Vec<Atom>,
    rhyme_atoms: Vec<RhymeAtom>,
    tone_regions: Vec<ToneRegion>,
}

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Expected {
    score: f64,
}

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Atom {
    name: String,
    pinyin: Vec<usize>,
}

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RhymeAtom {
    name: String,
    pinyin: Vec<usize>,
    baseline_keys: BTreeMap<String, char>,
}

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToneRegion {
    name: String,
    keys: String,
    tones: Vec<u8>,
}

fn parse_pair(value: &str, alphabet: &KeyAlphabet) -> Result<[u8; 2], String> {
    let mut chars = value.chars();
    let first = chars.next().ok_or("empty pair")?;
    let second = chars.next().ok_or("incomplete pair")?;
    if chars.next().is_some() {
        return Err("pair exceeds two keys".to_owned());
    }
    Ok([
        alphabet
            .index_of(first)
            .ok_or("first key outside alphabet")? as u8,
        alphabet
            .index_of(second)
            .ok_or("second key outside alphabet")? as u8,
    ])
}

fn parse_five_keys(value: &str, alphabet: &KeyAlphabet) -> Result<[u8; 5], String> {
    let chars = value.chars().collect::<Vec<_>>();
    if chars.len() != 5 {
        return Err("expected five keys".to_owned());
    }
    let mut result = [0_u8; 5];
    for (index, ch) in chars.into_iter().enumerate() {
        result[index] = alphabet.index_of(ch).ok_or("key outside alphabet")? as u8;
    }
    Ok(result)
}

fn projected_motor(
    corpus: &NativeCorpus,
    alphabet: &KeyAlphabet,
    snapshot: &Path,
) -> Result<ProjectedMotor, String> {
    let native = RoleTables::from_snapshot_json(
        alphabet,
        &fs::read_to_string(snapshot).map_err(|error| error.to_string())?,
        0.0,
    )?;
    let mut projections = HashMap::new();
    for (key, extension) in &corpus.header().extension_maps {
        let global = alphabet
            .index_of(key.chars().next().ok_or("empty extension key")?)
            .ok_or("unknown extension key")?;
        let donors = extension
            .donors
            .iter()
            .map(|(donor, weight)| {
                alphabet
                    .index_of(donor.chars().next().ok_or("empty donor key")?)
                    .map(|index| (index, *weight))
                    .ok_or("unknown donor key".to_owned())
            })
            .collect::<Result<Vec<_>, _>>()?;
        projections.insert(
            global,
            Projection {
                donors,
                distance_guard_multiplier: extension.distance_guard_multiplier,
            },
        );
    }
    ProjectedMotor::new(native, projections)
}

fn normalized_score(summary: &Summary, reference: &[f64; 4]) -> Result<f64, String> {
    let weights = [1.0_f64, 3.0, 1.0, 1.0];
    let mut total = 0.0;
    let mut weighted = 0.0;
    for kind in Kind::ALL {
        let value = summary
            .track(kind)
            .ok_or_else(|| format!("missing {kind:?}"))?
            .effective_ms;
        let weight = weights[kind.index()];
        weighted += weight * (value / reference[kind.index()]).powi(4);
        total += weight;
    }
    Ok(10.0 * (weighted / total).powf(0.25))
}

fn main() -> Result<(), String> {
    let corpus_path = PathBuf::from("research/.cache/ckt-v51-toned-native-corpus.bin");
    let fixture_path =
        PathBuf::from("research/.cache/ckt-v51-toned-mars10-anchor-sh-p-ch-s-u-k.json");
    let snapshot_path = PathBuf::from("tools/ckt_v4_upstream_role_tables.json");

    let fixture: TrialFixture =
        serde_json::from_str(&fs::read_to_string(&fixture_path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;

    let corpus = NativeCorpus::open(&corpus_path)?;
    let alphabet = KeyAlphabet::new(&fixture.key_alphabet)?;
    let tone_keys_by_tone = parse_five_keys(&fixture.tone_keys_by_tone, &alphabet)?;

    let mut toned_codes = fixture
        .toned_codes
        .iter()
        .map(|tones| {
            let mut result = [None; 5];
            for (tone, code) in tones.iter().enumerate() {
                result[tone] = code
                    .as_deref()
                    .map(|value| parse_pair(value, &alphabet))
                    .transpose()?;
            }
            Ok(result)
        })
        .collect::<Result<Vec<[Option<[u8; 2]>; 5]>, String>>()?;

    // Apply the 4th move: upper: i-er -> R
    let upper_r_idx = alphabet.index_of('R').ok_or("R not in alphabet")? as u8;
    let i_er_atom = fixture
        .rhyme_atoms
        .iter()
        .find(|r| r.name == "i-er")
        .ok_or("i-er not found")?;
    for &py in &i_er_atom.pinyin {
        // tone 4 is index 3
        if let Some(ref mut code) = toned_codes[py][3] {
            code[1] = upper_r_idx;
        }
    }

    let baseline = SchemeState::from_toned_codes(
        "UNEVEN786-4hop-champion",
        [21, 21],
        toned_codes.clone(),
        tone_keys_by_tone,
    )?;

    let motor = projected_motor(&corpus, &alphabet, &snapshot_path)?;
    let generated = corpus.generate(&baseline, InputMode::KeytaoV51)?;
    let parameters = CognitiveParameters {
        page_size: 6,
        selection_action_ms: 0.0,
        ..CognitiveParameters::default()
    };
    let motor_for_resolver = motor.clone();
    let mut resolver = IncrementalResolver::new(generated.rows, move |code| {
        motor_for_resolver.cost(code).map(|value| value.upper_ms)
    })?;
    let mut summary = IncrementalSummary::new(resolver.rows(), resolver.outcomes(), parameters)?;
    let baseline_score = normalized_score(&summary.summary(), &fixture.reference_effective_ms)?;

    println!("=========================================================================");
    println!(" Directed Audit: Targeted Unfreezing for 'er' (rhymeInternalSplits = 1) ");
    println!(" 4-Hop Champion Baseline CKT: {:.12}", baseline_score);
    println!("=========================================================================");

    let er_py_idx = fixture
        .pinyin
        .iter()
        .position(|p| p == "er")
        .ok_or("er not in pinyin")?;
    println!("'er' pinyin index: {}", er_py_idx);

    let home_region = fixture
        .tone_regions
        .iter()
        .find(|r| r.name == "home")
        .ok_or("home region not found")?;
    let upper_region = fixture
        .tone_regions
        .iter()
        .find(|r| r.name == "upper")
        .ok_or("upper region not found")?;

    let home_keys: Vec<char> = home_region.keys.chars().collect();
    let upper_keys: Vec<char> = upper_region.keys.chars().collect();

    println!("Home keys ({}): {:?}", home_keys.len(), home_keys);
    println!("Upper keys ({}): {:?}", upper_keys.len(), upper_keys);
    println!(
        "Total combinations to evaluate: {}",
        home_keys.len() * upper_keys.len()
    );

    struct CandidateEval {
        home_key: char,
        upper_key: char,
        score: f64,
        delta: f64,
    }

    let mut evals = Vec::new();

    for &home_key in &home_keys {
        let home_key_idx = alphabet.index_of(home_key).ok_or("key not in alphabet")? as u8;
        for &upper_key in &upper_keys {
            let upper_key_idx = alphabet.index_of(upper_key).ok_or("key not in alphabet")? as u8;

            let mut candidate = baseline.clone();
            // er tone 2 and 3 (tones 2, 3)
            if let Some(mut code) = candidate.code_at_tone(er_py_idx, 2) {
                code[1] = home_key_idx;
                candidate.assign_toned_code(er_py_idx, 2, Some(code))?;
            }
            if let Some(mut code) = candidate.code_at_tone(er_py_idx, 3) {
                code[1] = home_key_idx;
                candidate.assign_toned_code(er_py_idx, 3, Some(code))?;
            }
            // er tone 4
            if let Some(mut code) = candidate.code_at_tone(er_py_idx, 4) {
                code[1] = upper_key_idx;
                candidate.assign_toned_code(er_py_idx, 4, Some(code))?;
            }

            let direct = generated
                .dependencies
                .affected_rows(&baseline, &candidate)?;
            let updates = corpus.generate_updates(
                &candidate,
                InputMode::KeytaoV51,
                &generated.dependencies,
                &direct,
            )?;
            let receipt = resolver.apply_updates(updates)?;
            summary.apply_changes(resolver.rows(), receipt.outcome_changes())?;
            let score = normalized_score(&summary.summary(), &fixture.reference_effective_ms)?;
            let rollback = resolver.rollback(receipt)?;
            summary.apply_changes(resolver.rows(), rollback.outcome_changes())?;

            evals.push(CandidateEval {
                home_key,
                upper_key,
                score,
                delta: score - baseline_score,
            });
        }
    }

    evals.sort_by(|a, b| a.score.total_cmp(&b.score));

    println!("\nTop 15 Unfreezing Placements for 'er' (by CKT Score):");
    println!("-------------------------------------------------------------------------");
    println!("Rank | er(home) | er(upper) | CKT Score       | ΔChampion  | ΔMars0     ");
    println!("-------------------------------------------------------------------------");
    for (i, e) in evals.iter().take(15).enumerate() {
        let is_baseline = e.home_key == 'L' && e.upper_key == 'R';
        let marker = if is_baseline { " (Baseline)" } else { "" };
        println!(
            "#{:<3} | {:<8} | {:<9} | {:.12} | {:+.6}  | {:+.6}{}",
            i + 1,
            e.home_key,
            e.upper_key,
            e.score,
            e.delta,
            e.score - 9.556530457331402,
            marker
        );
    }
    println!("-------------------------------------------------------------------------");

    let baseline_pos = evals
        .iter()
        .position(|e| e.home_key == 'L' && e.upper_key == 'R')
        .unwrap();
    println!(
        "Baseline placement (home: L, upper: R) rank: #{} of 56",
        baseline_pos + 1
    );

    let best = &evals[0];
    println!(
        "\nBest 'er' Placement: home={}, upper={} with CKT={:.12} (Δ={:+.6})",
        best.home_key, best.upper_key, best.score, best.delta
    );

    Ok(())
}
