use ckt_v4_core::{
    CognitiveParameters, ErgonomicFixture, KeyAlphabet, Kind, NativeCorpus, ProjectedMotor,
    Projection, RegularLayout, RoleTables, SchemeFixture, SchemeState, Summary,
    composite_score, layout_state_key, resolve, summarize,
};
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

const HEADS: [&str; 27] = [
    "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "zh", "ch", "sh", "r",
    "z", "c", "s", "A", "E", "O", "W", "Y", "YU",
];
const FINALS: [&str; 35] = [
    "a", "ai", "an", "ang", "ao", "e", "ei", "en", "eng", "er", "i", "ia", "ian", "iang", "iao",
    "ie", "in", "ing", "iong", "iu", "o", "ong", "ou", "u", "ua", "uai", "uan", "uang", "ui", "un",
    "uo", "v", "van", "ve", "vn",
];

const PRODGATE_MAX_RP_S2: f64 = 0.0418079455791114;
const PRODGATE_MAX_RP: f64 = 0.05104491472386687;
const PRODGATE_MIN_HOME_FLOOR: f64 = 0.3507563825435487;
const PRODGATE_MAX_W: f64 = 0.03623226230403664;
const PRODGATE_MAX_Y: f64 = 0.06868516416255256;
const PRODGATE_MIN_MX: f64 = 140.842;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CollisionDetail {
    code: String,
    syllables: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Common399Report {
    u: usize,
    total: usize,
    collision_bucket_count: usize,
    affected_syllables: usize,
    bucket_distribution: BTreeMap<usize, usize>,
    collision_pairs: Vec<CollisionDetail>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TrackRates {
    character: f64,
    word2: f64,
    word3: f64,
    word4: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TracksReport {
    keytao: TrackRates,
    sanpin: TrackRates,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErgonomicsReport {
    rp_s2: f64,
    rp_max: f64,
    home_floor: f64,
    w_max: f64,
    y_max: f64,
    mx_score: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProdGateReport {
    passes_all: bool,
    rp_s2_pass: bool,
    rp_max_pass: bool,
    home_floor_pass: bool,
    w_max_pass: bool,
    y_max_pass: bool,
    mx_pass: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FullAuditOutput {
    id: String,
    state_key: String,
    reference_id: String,
    reference_score: f64,
    ckt_v4: f64,
    memory: usize,
    displaced_initials: usize,
    displaced_vowels: usize,
    common399: Common399Report,
    tracks: TracksReport,
    ergonomics: ErgonomicsReport,
    prod_gate: ProdGateReport,
    initial_map: BTreeMap<String, String>,
    final_map: BTreeMap<String, String>,
}

fn load_motor(
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
        let key = key.chars().next().ok_or("empty extension key")?;
        let global = alphabet.index_of(key).ok_or("unknown extension key")?;
        let donors = extension
            .donors
            .iter()
            .map(|(donor, weight)| {
                let donor = donor.chars().next().ok_or("empty donor key")?;
                alphabet
                    .index_of(donor)
                    .ok_or("unknown donor key")
                    .map(|index| (index, *weight))
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
    ProjectedMotor::new(native, projections)
}

fn score_modes(
    corpus: &NativeCorpus,
    scheme: &SchemeState,
    motor: &ProjectedMotor,
    parameters: CognitiveParameters,
) -> Result<Vec<Summary>, String> {
    [ckt_v4_core::InputMode::Keytao, ckt_v4_core::InputMode::Sanpin]
        .into_iter()
        .map(|mode| {
            let generated = corpus.generate(scheme, mode)?;
            let outcomes = resolve(&generated.rows, |code| {
                motor.cost(code).map(|value| value.upper_ms)
            })?;
            summarize(&generated.rows, &outcomes, parameters)
        })
        .collect()
}

fn layout_from_hex(hex_str: &str, id: &str) -> Result<RegularLayout, String> {
    let raw = (0..hex_str.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex_str[i..i + 2], 16))
        .collect::<Result<Vec<u8>, _>>()
        .map_err(|e| format!("invalid hex: {e}"))?;
    if raw.len() != 69 {
        return Err(format!("expected 69 bytes stateKey, got {}", raw.len()));
    }
    let capacity = [raw[0], raw[1]];
    let head_keys = raw[2..29].to_vec();
    let final_keys = raw[29..64].to_vec();
    let tone: [u8; 5] = raw[64..69].try_into().map_err(|_| "tone length must be 5")?;
    Ok(RegularLayout {
        id: id.to_owned(),
        capacity,
        head_keys,
        final_keys,
        tone,
    })
}

fn parse_layout_arg(arg: &str, schemes: &SchemeFixture, alphabet: &KeyAlphabet) -> Result<RegularLayout, String> {
    if arg.len() == 138 && arg.chars().all(|c| c.is_ascii_hexdigit()) {
        return layout_from_hex(arg, "custom-layout");
    }
    let path = Path::new(arg);
    if path.exists() {
        let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
        if let Ok(layout) = serde_json::from_str::<RegularLayout>(&content) {
            return Ok(layout);
        }
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(l) = val.get("layout") {
                if let Ok(layout) = serde_json::from_value::<RegularLayout>(l.clone()) {
                    return Ok(layout);
                }
            }
            if let Some(sk) = val.get("stateKey").and_then(|s| s.as_str()) {
                let id = val.get("layoutId").and_then(|s| s.as_str()).unwrap_or("custom-layout");
                return layout_from_hex(sk, id);
            }
        }
    }
    // Search in schemes.json
    if let Some(input) = schemes.schemes.iter().find(|s| s.id == arg) {
        return schemes.compile_layout(input, alphabet);
    }
    Err(format!("cannot resolve layout argument: {arg}"))
}

fn main() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let mut corpus_path = PathBuf::from("research/.cache/ckt-v4-native-corpus.bin");
    let mut schemes_path = PathBuf::from("research/.cache/ckt-v4-all-schemes.json");
    let mut snapshot_path = PathBuf::from("tools/ckt_v4_upstream_role_tables.json");
    let mut ergo_path = PathBuf::from("research/.cache/ckt-v4-ergonomics.json");
    let mut ref_id = "S005".to_owned();
    let mut layout_arg: Option<String> = None;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--corpus" => corpus_path = PathBuf::from(args.next().ok_or("missing --corpus value")?),
            "--schemes" => schemes_path = PathBuf::from(args.next().ok_or("missing --schemes value")?),
            "--snapshot" => snapshot_path = PathBuf::from(args.next().ok_or("missing --snapshot value")?),
            "--ergonomics" => ergo_path = PathBuf::from(args.next().ok_or("missing --ergonomics value")?),
            "--reference" => ref_id = args.next().ok_or("missing --reference value")?,
            "--layout" => layout_arg = Some(args.next().ok_or("missing --layout value")?),
            other => {
                if layout_arg.is_none() && !other.starts_with("--") {
                    layout_arg = Some(other.to_owned());
                } else {
                    return Err(format!("unknown argument: {other}"));
                }
            }
        }
    }

    let layout_arg = layout_arg.ok_or("missing layout argument (specify path, scheme id, or stateKey hex)")?;

    let corpus = NativeCorpus::open(&corpus_path)?;
    let schemes = SchemeFixture::open(&schemes_path)?;
    let alphabet = KeyAlphabet::new(&corpus.header().key_alphabet)?;
    let motor = load_motor(&corpus, &alphabet, &snapshot_path)?;
    let ergo_fixture = ErgonomicFixture::open(&ergo_path)?;
    let ergo_corpus = ergo_fixture.moving_hand.corpus("daily", "native-punctuation")?;

    let reference_input = schemes
        .schemes
        .iter()
        .find(|scheme| scheme.id == ref_id)
        .ok_or_else(|| format!("reference scheme {ref_id} is absent"))?;
    let reference_state = SchemeState::compile(reference_input, &alphabet, corpus.header().pinyin_count)?;
    let parameters = CognitiveParameters::default();
    let reference_summaries = score_modes(&corpus, &reference_state, &motor, parameters)?;

    let layout = parse_layout_arg(&layout_arg, &schemes, &alphabet)?;
    let layout_state = schemes.scheme_state(&layout)?;
    let candidate_summaries = score_modes(&corpus, &layout_state, &motor, parameters)?;
    let ckt_score = composite_score(&candidate_summaries, &reference_summaries)?;

    let loads = ergo_fixture.load_model.diagnose(&layout)?;
    let mx_score = ergo_fixture.moving_hand.evaluate(&layout_state, &ergo_corpus)?.score;
    let diag = layout.diagnostics(&alphabet, &schemes.heads, &schemes.finals)?;

    // Common399 collision audit
    let mut code_map: BTreeMap<(u8, u8), Vec<usize>> = BTreeMap::new();
    for &p_idx in &schemes.common_pinyin {
        let [h_idx, f_idx] = schemes.pinyin_map[usize::from(p_idx)];
        let hk = layout.head_keys[h_idx as usize];
        let fk = layout.final_keys[f_idx as usize];
        code_map.entry((hk, fk)).or_default().push(usize::from(p_idx));
    }
    let u = code_map.len();
    let mut collision_buckets = 0;
    let mut affected_syllables = 0;
    let mut bucket_dist: BTreeMap<usize, usize> = BTreeMap::new();
    let mut collision_pairs = Vec::new();

    let alpha_chars: Vec<char> = corpus.header().key_alphabet.chars().collect();

    for (&(hk, fk), syllables) in &code_map {
        let count = syllables.len();
        if count > 1 {
            collision_buckets += 1;
            affected_syllables += count;
            *bucket_dist.entry(count).or_default() += 1;
            let code_str = format!("{}{}", alpha_chars[hk as usize], alpha_chars[fk as usize]);
            let syl_names = syllables
                .iter()
                .map(|&idx| {
                    let [h, f] = schemes.pinyin_map[idx];
                    format!("{}+{}", HEADS[h as usize], FINALS[f as usize])
                })
                .collect();
            collision_pairs.push(CollisionDetail {
                code: code_str,
                syllables: syl_names,
            });
        }
    }

    let kt = &candidate_summaries[0];
    let sp = &candidate_summaries[1];

    let kt_char = kt.track(Kind::Character).map(|t| t.selection_rate).unwrap_or(0.0);
    let kt_w2 = kt.track(Kind::Word2).map(|t| t.selection_rate).unwrap_or(0.0);
    let kt_w3 = kt.track(Kind::Word3).map(|t| t.selection_rate).unwrap_or(0.0);
    let kt_w4 = kt.track(Kind::Word4).map(|t| t.selection_rate).unwrap_or(0.0);

    let sp_char = sp.track(Kind::Character).map(|t| t.selection_rate).unwrap_or(0.0);
    let sp_w2 = sp.track(Kind::Word2).map(|t| t.selection_rate).unwrap_or(0.0);
    let sp_w3 = sp.track(Kind::Word3).map(|t| t.selection_rate).unwrap_or(0.0);
    let sp_w4 = sp.track(Kind::Word4).map(|t| t.selection_rate).unwrap_or(0.0);

    const EPS: f64 = 1e-12;
    let passes_rp_s2 = loads.rp_s2 <= PRODGATE_MAX_RP_S2 + EPS;
    let passes_rp_max = loads.rp_max <= PRODGATE_MAX_RP + EPS;
    let passes_home = loads.home_floor >= PRODGATE_MIN_HOME_FLOOR - EPS;
    let passes_w = loads.w_max <= PRODGATE_MAX_W + EPS;
    let passes_y = loads.y_max <= PRODGATE_MAX_Y + EPS;
    let passes_mx = mx_score >= PRODGATE_MIN_MX - EPS;
    let passes_all = passes_rp_s2 && passes_rp_max && passes_home && passes_w && passes_y && passes_mx;

    let mut initial_map = BTreeMap::new();
    for (i, &h) in HEADS.iter().enumerate() {
        let k = layout.head_keys[i];
        initial_map.insert(h.to_string(), alpha_chars[k as usize].to_string());
    }
    let mut final_map = BTreeMap::new();
    for (i, &f) in FINALS.iter().enumerate() {
        let k = layout.final_keys[i];
        final_map.insert(f.to_string(), alpha_chars[k as usize].to_string());
    }

    let report = FullAuditOutput {
        id: layout.id.clone(),
        state_key: layout_state_key(&layout),
        reference_id: ref_id,
        reference_score: 10.0,
        ckt_v4: ckt_score,
        memory: diag.memory,
        displaced_initials: diag.displaced_initials,
        displaced_vowels: diag.displaced_vowels,
        common399: Common399Report {
            u,
            total: schemes.common_pinyin.len(),
            collision_bucket_count: collision_buckets,
            affected_syllables,
            bucket_distribution: bucket_dist,
            collision_pairs,
        },
        tracks: TracksReport {
            keytao: TrackRates {
                character: kt_char,
                word2: kt_w2,
                word3: kt_w3,
                word4: kt_w4,
            },
            sanpin: TrackRates {
                character: sp_char,
                word2: sp_w2,
                word3: sp_w3,
                word4: sp_w4,
            },
        },
        ergonomics: ErgonomicsReport {
            rp_s2: loads.rp_s2,
            rp_max: loads.rp_max,
            home_floor: loads.home_floor,
            w_max: loads.w_max,
            y_max: loads.y_max,
            mx_score,
        },
        prod_gate: ProdGateReport {
            passes_all,
            rp_s2_pass: passes_rp_s2,
            rp_max_pass: passes_rp_max,
            home_floor_pass: passes_home,
            w_max_pass: passes_w,
            y_max_pass: passes_y,
            mx_pass: passes_mx,
        },
        initial_map,
        final_map,
    };

    println!("{}", serde_json::to_string_pretty(&report).map_err(|e| e.to_string())?);
    Ok(())
}
