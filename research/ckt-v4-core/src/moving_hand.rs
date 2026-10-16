use crate::SchemeState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const MX_KEYS: &str = "QWERTYUIOPASDFGHJKL;ZXCVBNM,./[]\\'";
const LAYOUT_KEYS: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ[]\\;',./";
const MX_UNIT: &str = "relative hand-model cost; not ms";

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MovingHandModel {
    pub keys: String,
    pub layout_key_alphabet: String,
    pub geometry: HashMap<String, KeyGeometry>,
    pub finger_speeds: Vec<f64>,
    pub row_stagger: RowStagger,
    pub initial_previous_column: f64,
    pub unit: String,
    pub corpora: HashMap<String, MovingHandCorpus>,
}

#[derive(Clone, Copy, Debug, Deserialize)]
pub struct KeyGeometry {
    pub x: f64,
    pub y: usize,
    pub finger: usize,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowStagger {
    pub first_lower_row: f64,
    pub per_additional_row: f64,
}

#[derive(Clone, Debug, Deserialize)]
pub struct MovingHandCorpus {
    pub tokens: Vec<MovingHandToken>,
    #[serde(default)]
    pub variants: HashMap<String, CorpusVariant>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MovingHandToken {
    #[serde(rename = "char")]
    pub character: String,
    pub pinyin: Option<String>,
    pub pinyin_index: Option<usize>,
    pub key: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CorpusVariant {
    pub token_count: usize,
    pub character_count: usize,
    pub include_fixed_keys: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct MovingHandSummary {
    pub hits: usize,
    pub chars: usize,
    pub time: f64,
    pub effective_distance: f64,
    pub overlap_distance: f64,
    pub same_hand_hits: usize,
    pub same_finger_hits: [usize; 16],
    pub diff_finger_hits: [usize; 16],
    pub score: f64,
    pub speed: f64,
    pub total_distance: f64,
    pub row_load: [usize; 3],
    pub finger_load: [usize; 10],
    pub left_load: usize,
    pub right_load: usize,
    pub avg_time: f64,
    pub avg_distance: f64,
    pub avg_effective_distance: f64,
    pub avg_overlap_distance: f64,
    pub same_hand_rate: f64,
    #[serde(rename = "extendedKeyHits")]
    pub extended_key_hits: usize,
    pub unit: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[serde(rename = "strokeSha256")]
    pub stroke_sha256: Option<String>,
}

impl MovingHandCorpus {
    pub fn from_tokens(tokens: Vec<MovingHandToken>) -> Self {
        Self {
            tokens,
            variants: HashMap::new(),
        }
    }
}

impl MovingHandModel {
    pub fn validate(&self) -> Result<(), String> {
        if self.keys != MX_KEYS {
            return Err("moving-hand key order differs from frozen MX34 order".to_owned());
        }
        if self.layout_key_alphabet != LAYOUT_KEYS {
            return Err("moving-hand layout key order differs from the native kernel".to_owned());
        }
        if self.geometry.len() != 34
            || self
                .keys
                .chars()
                .any(|key| !self.geometry.contains_key(&key.to_string()))
        {
            return Err("moving-hand geometry does not cover all 34 keys".to_owned());
        }
        if self.finger_speeds.len() != 10
            || self
                .finger_speeds
                .iter()
                .any(|speed| !speed.is_finite() || *speed <= 0.0)
        {
            return Err("moving-hand finger speeds must contain ten positive values".to_owned());
        }
        if self.initial_previous_column != 0.0
            || self.unit != MX_UNIT
            || !self.row_stagger.first_lower_row.is_finite()
            || !self.row_stagger.per_additional_row.is_finite()
        {
            return Err("moving-hand numerical contract constants changed".to_owned());
        }
        for key in self.keys.chars() {
            let geometry = self.geometry(key)?;
            if !geometry.x.is_finite() || geometry.y >= 3 || geometry.finger >= 10 {
                return Err(format!("moving-hand geometry for {key:?} is invalid"));
            }
        }
        for (name, corpus) in &self.corpora {
            for token in &corpus.tokens {
                if token.key.is_none() && token.pinyin_index.is_none() {
                    return Err(format!("moving-hand corpus {name:?} has an unmapped token"));
                }
            }
            for (variant, metadata) in &corpus.variants {
                let expected = if metadata.include_fixed_keys {
                    corpus.tokens.len()
                } else {
                    corpus
                        .tokens
                        .iter()
                        .filter(|token| token.pinyin.is_some())
                        .count()
                };
                if metadata.token_count != expected || metadata.character_count != expected {
                    return Err(format!(
                        "moving-hand corpus {name:?} variant {variant:?} count mismatch"
                    ));
                }
            }
        }
        Ok(())
    }

    pub fn corpus(&self, name: &str, variant: &str) -> Result<MovingHandCorpus, String> {
        let source = self
            .corpora
            .get(name)
            .ok_or_else(|| format!("unknown moving-hand corpus {name:?}"))?;
        let metadata = source
            .variants
            .get(variant)
            .ok_or_else(|| format!("unknown moving-hand corpus variant {variant:?}"))?;
        let tokens = source
            .tokens
            .iter()
            .filter(|token| metadata.include_fixed_keys || token.pinyin.is_some())
            .cloned()
            .collect();
        Ok(MovingHandCorpus::from_tokens(tokens))
    }

    pub fn evaluate(
        &self,
        scheme: &SchemeState,
        corpus: &MovingHandCorpus,
    ) -> Result<MovingHandSummary, String> {
        let alphabet: Vec<char> = self.layout_key_alphabet.chars().collect();
        let mut strokes = Vec::with_capacity(corpus.tokens.len() * 2);
        for token in &corpus.tokens {
            if let Some(key) = &token.key {
                let mut chars = key.chars();
                let key = chars
                    .next()
                    .ok_or_else(|| "moving-hand fixed key is empty".to_owned())?
                    .to_ascii_uppercase();
                if chars.next().is_some() {
                    return Err(format!("moving-hand fixed key {key:?} is not one key"));
                }
                strokes.push(key);
                continue;
            }
            let index = token.pinyin_index.ok_or_else(|| {
                format!("moving-hand token {:?} lacks pinyin index", token.pinyin)
            })?;
            let code = scheme
                .code_at(index)
                .ok_or_else(|| format!("scheme lacks pinyin code at index {index}"))?;
            for key_index in code {
                strokes.push(
                    alphabet
                        .get(usize::from(key_index))
                        .copied()
                        .ok_or_else(|| format!("scheme key index {key_index} is outside MX34"))?,
                );
            }
        }
        if strokes.is_empty() {
            return Err("empty moving-hand corpus is not a benchmark".to_owned());
        }
        for &key in &strokes {
            self.geometry(key)
                .map_err(|_| format!("moving-hand input contains unknown key {key:?}"))?;
        }

        let mut positions = [[0.0, 0.0], [0.0, 0.0]];
        let mut last = self.initial_previous_column;
        let mut last_finger = 0_usize;
        let mut time = 0.0;
        let mut effective_distance = 0.0;
        let mut overlap_distance = 0.0;
        let mut same_hand_hits = 0;
        let mut same_finger_hits = [0; 16];
        let mut diff_finger_hits = [0; 16];
        let mut row_load = [0; 3];
        let mut finger_load = [0; 10];
        let mut left_load = 0;
        let mut extended_key_hits = 0;

        for key in strokes.iter().copied() {
            let geometry = *self.geometry(key)?;
            let hand = usize::from(geometry.x >= 5.0);
            let same_hand = hand == usize::from(last >= 5.0);
            let previous_x = geometry.finger as f64 + positions[hand][0];
            let previous_y = 1.0 + positions[hand][1];
            positions[hand] = [geometry.x - geometry.finger as f64, geometry.y as f64 - 1.0];
            let movement = if same_hand {
                self.distance(previous_x, previous_y, geometry.x, geometry.y as f64)
            } else {
                0.0
            };
            let distance = 0.2 + movement;
            time += distance / self.finger_speeds[geometry.finger];
            effective_distance += distance;
            if same_hand {
                same_hand_hits += 1;
            } else {
                overlap_distance +=
                    self.distance(previous_x, previous_y, geometry.x, geometry.y as f64);
            }
            let bucket = distance.floor() as usize;
            if bucket >= 16 {
                return Err(format!(
                    "moving-hand distance bucket {bucket} exceeds contract"
                ));
            }
            if geometry.finger == last_finger {
                same_finger_hits[bucket] += 1;
            } else if same_hand {
                diff_finger_hits[bucket] += 1;
            }
            row_load[geometry.y] += 1;
            finger_load[geometry.finger] += 1;
            left_load += usize::from(geometry.x < 5.0);
            extended_key_hits += usize::from(matches!(key, '[' | ']' | '\\' | '\''));
            last = geometry.x;
            last_finger = geometry.finger;
        }

        let hits = strokes.len();
        let chars = corpus.tokens.len();
        let total_distance = effective_distance + overlap_distance;
        Ok(MovingHandSummary {
            hits,
            chars,
            time,
            effective_distance,
            overlap_distance,
            same_hand_hits,
            same_finger_hits,
            diff_finger_hits,
            score: chars as f64 / time * 200.0,
            speed: hits as f64 / time * 100.0,
            total_distance,
            row_load,
            finger_load,
            left_load,
            right_load: hits - left_load,
            avg_time: time / hits as f64,
            avg_distance: total_distance / hits as f64,
            avg_effective_distance: effective_distance / hits as f64,
            avg_overlap_distance: overlap_distance / hits as f64,
            same_hand_rate: same_hand_hits as f64 / hits as f64,
            extended_key_hits,
            unit: self.unit.clone(),
            stroke_sha256: None,
        })
    }

    fn geometry(&self, key: char) -> Result<&KeyGeometry, String> {
        self.geometry
            .get(&key.to_string())
            .ok_or_else(|| format!("moving-hand geometry lacks key {key:?}"))
    }

    fn distance(&self, mut x0: f64, y0: f64, mut x1: f64, y1: f64) -> f64 {
        if y0 > 0.0 {
            x0 +=
                self.row_stagger.first_lower_row + (y0 - 1.0) * self.row_stagger.per_additional_row;
        }
        if y1 > 0.0 {
            x1 +=
                self.row_stagger.first_lower_row + (y1 - 1.0) * self.row_stagger.per_additional_row;
        }
        ((x0 - x1).powi(2) + (y0 - y1).powi(2)).sqrt()
    }
}
