use crate::{KeyAlphabet, SchemeState};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub const JOINT_ANNEAL_VERSION: &str = "ckt-v51-toned-2121-joint-anneal-v2";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrialFixture {
    pub version: String,
    pub layout_id: String,
    pub key_alphabet: String,
    pub tone_keys_by_tone: String,
    pub sound_keys: String,
    pub baseline_memory_lower: usize,
    pub baseline_memory_guard: usize,
    pub baseline_tone_region_merge_lower: usize,
    pub expected: Expected,
    pub reference_effective_ms: [f64; 4],
    pub pinyin: Vec<String>,
    pub toned_codes: Vec<[Option<String>; 5]>,
    pub atoms: Vec<Atom>,
    pub searchable_first_atoms: Vec<String>,
    pub rhyme_atoms: Vec<RhymeAtom>,
    pub tone_regions: Vec<ToneRegion>,
    #[serde(default)]
    pub source_hashes: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Expected {
    pub score: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Atom {
    pub name: String,
    pub initial: String,
    pub baseline_key: char,
    pub move_memory_delta: usize,
    pub pinyin: Vec<usize>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RhymeAtom {
    pub name: String,
    pub pinyin: Vec<usize>,
    pub baseline_keys: BTreeMap<String, char>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToneRegion {
    pub name: String,
    pub keys: String,
    pub tones: Vec<u8>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AnnealState {
    pub first_keys: Vec<char>,
    pub rhyme_keys: Vec<Vec<char>>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub step: usize,
    pub score: f64,
    #[serde(default)]
    pub d: usize,
    #[serde(default)]
    pub m_lower: usize,
    pub description: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnchorCheckpoint {
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub best_score: Option<f64>,
    #[serde(default)]
    pub current_score: Option<f64>,
    #[serde(default)]
    pub best_state: Option<AnnealState>,
    #[serde(default)]
    pub current_state: Option<AnnealState>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostics {
    pub layout1407_occupied_buckets: usize,
    pub layout1407_empty_buckets_count: usize,
    pub layout1407_empty_buckets: Vec<String>,
    pub common1237_occupied_buckets: usize,
    pub common1237_empty_buckets_count: usize,
    pub common1237_empty_buckets: Vec<String>,
    pub qz_empty: bool,
    pub ordinary_d: usize,
    #[serde(default)]
    pub ordinary_f: usize,
    pub memory_lower: usize,
    pub memory_guard: usize,
    pub merge_lower: usize,
    #[serde(default)]
    pub first_group_moves: usize,
    #[serde(default)]
    pub special_first_moves: usize,
    #[serde(default)]
    pub rhyme_group_moves: usize,
    #[serde(default)]
    pub rhyme_internal_splits: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParetoEntry {
    pub score: f64,
    pub ordinary_d: usize,
    pub memory_lower: usize,
    pub memory_guard: usize,
    pub merge_lower: usize,
    pub first_group_moves: usize,
    pub rhyme_group_moves: usize,
    pub rhyme_internal_splits: usize,
    pub step: usize,
    pub description: String,
    pub state: AnnealState,
    #[serde(default)]
    pub diagnostics: Option<Diagnostics>,
}

pub fn pareto_dominates(a: &ParetoEntry, b: &ParetoEntry) -> bool {
    a.ordinary_d <= b.ordinary_d
        && a.memory_lower <= b.memory_lower
        && a.score <= b.score
        && (a.ordinary_d < b.ordinary_d || a.memory_lower < b.memory_lower || a.score < b.score)
}

pub fn update_pareto_frontier(frontier: &mut Vec<ParetoEntry>, cand: ParetoEntry) -> bool {
    // Reject if identical state already recorded at equal or better score
    if frontier
        .iter()
        .any(|p| p.state == cand.state && p.score <= cand.score + 1e-12)
    {
        return false;
    }
    // Reject if any existing entry dominates or ties within fp jitter on the same (D, M) tier
    if frontier.iter().any(|p| {
        p.ordinary_d <= cand.ordinary_d
            && p.memory_lower <= cand.memory_lower
            && p.score <= cand.score + 1e-12
    }) {
        return false;
    }
    frontier.retain(|p| !pareto_dominates(&cand, p));
    frontier.push(cand);
    frontier.sort_by(|a, b| {
        a.ordinary_d
            .cmp(&b.ordinary_d)
            .then_with(|| a.memory_lower.cmp(&b.memory_lower))
            .then_with(|| a.score.total_cmp(&b.score))
    });
    true
}

fn default_one() -> usize {
    1
}

pub fn stage_temperature(
    step: usize,
    total_steps: usize,
    stages: usize,
    initial_temp: f64,
    final_temp: f64,
) -> (usize, f64) {
    let total_steps = total_steps.max(1);
    let stages = stages.max(1);
    if stages == 1 {
        let progress = (step as f64 / total_steps as f64).min(1.0);
        let temp = initial_temp * (final_temp / initial_temp).powf(progress);
        return (0, temp);
    }
    let stage_idx = ((step * stages) / total_steps).min(stages - 1);
    let stage_start = (stage_idx * total_steps) / stages;
    let stage_end = (((stage_idx + 1) * total_steps) / stages).max(stage_start + 1);
    let stage_len = (stage_end - stage_start) as f64;
    let local_prog = ((step.saturating_sub(stage_start)) as f64 / stage_len).min(1.0);

    let stage_top = (initial_temp * 0.5_f64.powi(stage_idx as i32)).max(final_temp * 2.0);
    let stage_bot = if stage_idx + 1 == stages {
        final_temp
    } else {
        (stage_top * 0.03).max(final_temp)
    };
    let temp = stage_top * (stage_bot / stage_top).powf(local_prog);
    (stage_idx, temp)
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnealCheckpoint {
    pub version: String,
    #[serde(default)]
    pub fixture_id: Option<String>,
    #[serde(default)]
    pub layout_id: Option<String>,
    #[serde(default)]
    pub source_hashes: BTreeMap<String, String>,
    #[serde(default)]
    pub require_empty_buckets: Vec<String>,
    #[serde(default)]
    pub max_d: usize,
    #[serde(default)]
    pub rhyme_only: bool,
    #[serde(default = "default_one")]
    pub stages: usize,
    #[serde(default)]
    pub step: usize,
    #[serde(default)]
    pub total_steps: usize,
    #[serde(default)]
    pub temperature: f64,
    #[serde(default)]
    pub current_score: f64,
    #[serde(default)]
    pub best_score: f64,
    #[serde(default)]
    pub base_score: f64,
    #[serde(default)]
    pub accepted: usize,
    #[serde(default)]
    pub evaluated: usize,
    #[serde(default)]
    pub rejected_forbidden: usize,
    #[serde(default)]
    pub elapsed_ms: f64,
    pub current_state: AnnealState,
    pub best_state: AnnealState,
    #[serde(default)]
    pub history: Vec<HistoryEntry>,
    #[serde(default)]
    pub diagnostics: Option<Diagnostics>,
    #[serde(default)]
    pub pareto_frontier: Vec<ParetoEntry>,
}

impl AnnealCheckpoint {
    pub fn validate_resume_contract(
        &self,
        expected_fixture_id: &str,
        expected_source_hashes: &BTreeMap<String, String>,
        expected_require_empty_buckets: &[String],
        expected_max_d: usize,
    ) -> Result<(), String> {
        if self.version != JOINT_ANNEAL_VERSION {
            return Err(format!(
                "checkpoint version mismatch: expected {}, found {}",
                JOINT_ANNEAL_VERSION, self.version
            ));
        }
        let self_fixture_id = self.fixture_id.as_deref().or(self.layout_id.as_deref());
        if self_fixture_id != Some(expected_fixture_id) {
            return Err(format!(
                "checkpoint fixture_id mismatch: expected {}, found {:?}",
                expected_fixture_id, self_fixture_id
            ));
        }
        if !self.source_hashes.is_empty() && &self.source_hashes != expected_source_hashes {
            return Err(format!(
                "checkpoint source_hashes mismatch: expected {:?}, found {:?}",
                expected_source_hashes, self.source_hashes
            ));
        }
        let mut self_buckets = self.require_empty_buckets.clone();
        self_buckets.sort();
        let mut exp_buckets = expected_require_empty_buckets.to_vec();
        exp_buckets.sort();
        if self_buckets != exp_buckets {
            return Err(format!(
                "checkpoint require_empty_buckets mismatch: expected {:?}, found {:?}",
                exp_buckets, self_buckets
            ));
        }
        if self.max_d != expected_max_d {
            return Err(format!(
                "checkpoint max_d mismatch: expected {}, found {}",
                expected_max_d, self.max_d
            ));
        }
        Ok(())
    }
}

#[derive(Clone, Debug)]
pub struct LegalSyllable {
    pub atom_idx: usize,
    pub rhyme_idx: usize,
    pub region_idx: usize,
    pub py_idx: usize,
    pub tone: u8,
    pub syllable: String,
    pub is_audit_token: bool,
}

#[derive(Clone, Debug)]
pub struct BucketValidator {
    pub syllables: Vec<LegalSyllable>,
    pub sound_keys: Vec<char>,
}

impl BucketValidator {
    pub fn from_fixture(
        fixture: &TrialFixture,
        audit_tokens: Option<&BTreeSet<String>>,
    ) -> Result<Self, String> {
        let mut atom_map = vec![None; fixture.pinyin.len()];
        for (i, atom) in fixture.atoms.iter().enumerate() {
            for &p in &atom.pinyin {
                atom_map[p] = Some(i);
            }
        }

        let mut rhyme_map = vec![None; fixture.pinyin.len()];
        for (i, rhyme) in fixture.rhyme_atoms.iter().enumerate() {
            for &p in &rhyme.pinyin {
                rhyme_map[p] = Some(i);
            }
        }

        let tone_to_region = |tone: u8| -> Option<usize> {
            fixture
                .tone_regions
                .iter()
                .position(|r| r.tones.contains(&tone))
        };

        let mut syllables = Vec::with_capacity(1407);
        for py in 0..fixture.pinyin.len() {
            for t in 0..5 {
                if fixture.toned_codes[py][t].is_some() {
                    let tone = (t + 1) as u8;
                    let atom_idx = atom_map[py].ok_or_else(|| {
                        format!("missing atom for py index {py} ({})", fixture.pinyin[py])
                    })?;
                    let rhyme_idx = rhyme_map[py].ok_or_else(|| {
                        format!("missing rhyme for py index {py} ({})", fixture.pinyin[py])
                    })?;
                    let region_idx = tone_to_region(tone)
                        .ok_or_else(|| format!("missing tone region for tone {tone}"))?;
                    let syllable = format!("{}{tone}", fixture.pinyin[py]);
                    let is_audit_token = audit_tokens.map_or(false, |set| set.contains(&syllable));
                    syllables.push(LegalSyllable {
                        atom_idx,
                        rhyme_idx,
                        region_idx,
                        py_idx: py,
                        tone,
                        syllable,
                        is_audit_token,
                    });
                }
            }
        }

        let sound_keys: Vec<char> = fixture.sound_keys.chars().collect();
        Ok(Self {
            syllables,
            sound_keys,
        })
    }

    pub fn is_valid_forbidden(&self, state: &AnnealState, forbidden: &[(char, char)]) -> bool {
        if forbidden.is_empty() {
            return true;
        }
        for s in &self.syllables {
            let k1 = state.first_keys[s.atom_idx];
            let k2 = state.rhyme_keys[s.region_idx][s.rhyme_idx];
            for &(f1, f2) in forbidden {
                if k1 == f1 && k2 == f2 {
                    return false;
                }
            }
        }
        true
    }

    pub fn find_forbidden_violations(
        &self,
        state: &AnnealState,
        forbidden: &[(char, char)],
    ) -> Vec<(String, String)> {
        let mut violations = Vec::new();
        for s in &self.syllables {
            let k1 = state.first_keys[s.atom_idx];
            let k2 = state.rhyme_keys[s.region_idx][s.rhyme_idx];
            for &(f1, f2) in forbidden {
                if k1 == f1 && k2 == f2 {
                    violations.push((format!("{k1}{k2}"), s.syllable.clone()));
                }
            }
        }
        violations
    }

    pub fn compute_diagnostics(&self, state: &AnnealState, fixture: &TrialFixture) -> Diagnostics {
        let mut occupied_1407 = BTreeSet::new();
        let mut occupied_1237 = BTreeSet::new();

        for s in &self.syllables {
            let k1 = state.first_keys[s.atom_idx];
            let k2 = state.rhyme_keys[s.region_idx][s.rhyme_idx];
            let bucket = format!("{k1}{k2}");
            occupied_1407.insert(bucket.clone());
            if s.is_audit_token {
                occupied_1237.insert(bucket);
            }
        }

        let mut empty_1407 = Vec::new();
        let mut empty_1237 = Vec::new();

        for &c1 in &self.sound_keys {
            for &c2 in &self.sound_keys {
                let bucket = format!("{c1}{c2}");
                if !occupied_1407.contains(&bucket) {
                    empty_1407.push(bucket.clone());
                }
                if !occupied_1237.contains(&bucket) {
                    empty_1237.push(bucket);
                }
            }
        }

        let qz_empty = !occupied_1407.contains("QZ");
        let ordinary_d = calc_ordinary_d(state, fixture);
        let ordinary_f = calc_ordinary_f(state, fixture);
        let (memory_lower, memory_guard, merge_lower) = calc_memory_metrics(state, fixture);
        let (first_group_moves, special_first_moves, rhyme_group_moves) =
            calc_move_metrics(state, fixture);

        Diagnostics {
            layout1407_occupied_buckets: occupied_1407.len(),
            layout1407_empty_buckets_count: empty_1407.len(),
            layout1407_empty_buckets: empty_1407,
            common1237_occupied_buckets: occupied_1237.len(),
            common1237_empty_buckets_count: empty_1237.len(),
            common1237_empty_buckets: empty_1237,
            qz_empty,
            ordinary_d,
            ordinary_f,
            memory_lower,
            memory_guard,
            merge_lower,
            first_group_moves,
            special_first_moves,
            rhyme_group_moves,
            rhyme_internal_splits: 0,
        }
    }
}

pub fn parse_forbidden_buckets(
    raw_buckets: &[String],
    sound_keys: &str,
) -> Result<Vec<(char, char)>, String> {
    let mut pairs = Vec::with_capacity(raw_buckets.len());
    for raw in raw_buckets {
        let trimmed = raw.trim().to_ascii_uppercase();
        let chars: Vec<char> = trimmed.chars().collect();
        if chars.len() != 2 {
            return Err(format!(
                "forbidden bucket must be 2 characters, found '{raw}'"
            ));
        }
        if !sound_keys.contains(chars[0]) || !sound_keys.contains(chars[1]) {
            return Err(format!(
                "forbidden bucket '{raw}' contains keys outside sound_keys '{sound_keys}'"
            ));
        }
        pairs.push((chars[0], chars[1]));
    }
    Ok(pairs)
}

pub fn calc_ordinary_d(state: &AnnealState, fixture: &TrialFixture) -> usize {
    fixture
        .atoms
        .iter()
        .enumerate()
        .filter(|(_, a)| a.initial.len() == 1 && a.initial != "_")
        .filter(|(i, a)| state.first_keys[*i] != a.baseline_key)
        .count()
}

pub fn calc_ordinary_f(state: &AnnealState, fixture: &TrialFixture) -> usize {
    fixture
        .atoms
        .iter()
        .enumerate()
        .filter(|(_, a)| a.initial.len() == 1 && a.initial != "_")
        .filter(|(i, _)| !fixture.sound_keys.contains(state.first_keys[*i]))
        .count()
}

pub fn calc_move_metrics(state: &AnnealState, fixture: &TrialFixture) -> (usize, usize, usize) {
    let first_group_moves = fixture
        .atoms
        .iter()
        .enumerate()
        .filter(|(i, a)| state.first_keys[*i] != a.baseline_key)
        .count();
    let special_first_moves = fixture
        .atoms
        .iter()
        .enumerate()
        .filter(|(_, a)| fixture.searchable_first_atoms.contains(&a.name))
        .filter(|(i, a)| state.first_keys[*i] != a.baseline_key)
        .count();
    let mut rhyme_group_moves = 0;
    for (region_idx, region) in fixture.tone_regions.iter().enumerate() {
        for (rhyme_idx, rhyme) in fixture.rhyme_atoms.iter().enumerate() {
            if let Some(&base_key) = rhyme.baseline_keys.get(&region.name) {
                if state.rhyme_keys[region_idx][rhyme_idx] != base_key {
                    rhyme_group_moves += 1;
                }
            }
        }
    }
    (first_group_moves, special_first_moves, rhyme_group_moves)
}

pub fn calc_memory_metrics(state: &AnnealState, fixture: &TrialFixture) -> (usize, usize, usize) {
    let mut first_memory_delta = 0;
    for (i, atom) in fixture.atoms.iter().enumerate() {
        if state.first_keys[i] != atom.baseline_key {
            first_memory_delta += atom.move_memory_delta;
        }
    }
    let mut merge_lower = 0;
    for (region_idx, _region) in fixture.tone_regions.iter().enumerate() {
        let keys: BTreeSet<char> = state.rhyme_keys[region_idx].iter().copied().collect();
        merge_lower += fixture.rhyme_atoms.len().saturating_sub(keys.len());
    }
    let merge_delta = merge_lower as isize - fixture.baseline_tone_region_merge_lower as isize;
    let adjust = |baseline: usize| -> usize {
        if merge_delta >= 0 {
            baseline + first_memory_delta + merge_delta as usize
        } else {
            baseline + first_memory_delta - (-merge_delta) as usize
        }
    };
    (
        adjust(fixture.baseline_memory_lower),
        adjust(fixture.baseline_memory_guard),
        merge_lower,
    )
}

pub fn build_scheme_state(
    state: &AnnealState,
    fixture: &TrialFixture,
    alphabet: &KeyAlphabet,
    tone_keys_by_tone: [u8; 5],
) -> Result<SchemeState, String> {
    let mut toned_codes = vec![[None; 5]; fixture.pinyin.len()];

    // 1. Assign first keys
    for (atom_idx, &key_char) in state.first_keys.iter().enumerate() {
        let key_u8 = alphabet.index_of(key_char).ok_or("invalid first key")? as u8;
        let atom = &fixture.atoms[atom_idx];
        for &py in &atom.pinyin {
            for t in 0..5 {
                if fixture.toned_codes[py][t].is_some() {
                    let mut pair = toned_codes[py][t].unwrap_or([0, 0]);
                    pair[0] = key_u8;
                    toned_codes[py][t] = Some(pair);
                }
            }
        }
    }

    // 2. Assign second keys from rhyme groups across tone regions
    for (region_idx, region) in fixture.tone_regions.iter().enumerate() {
        for (rhyme_idx, &key_char) in state.rhyme_keys[region_idx].iter().enumerate() {
            let key_u8 = alphabet.index_of(key_char).ok_or("invalid rhyme key")? as u8;
            let rhyme_atom = &fixture.rhyme_atoms[rhyme_idx];
            for &py in &rhyme_atom.pinyin {
                for &tone in &region.tones {
                    let t_idx = (tone - 1) as usize;
                    if fixture.toned_codes[py][t_idx].is_some() {
                        let mut pair = toned_codes[py][t_idx].unwrap_or([0, 0]);
                        pair[1] = key_u8;
                        toned_codes[py][t_idx] = Some(pair);
                    }
                }
            }
        }
    }

    SchemeState::from_toned_codes(&fixture.layout_id, [21, 21], toned_codes, tone_keys_by_tone)
}
