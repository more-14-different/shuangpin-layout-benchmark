use crate::RegularLayout;
use crate::moving_hand::{MovingHandModel, MovingHandSummary};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

const VERSION: &str = "ckt-v4-ergonomics-1";
const LOAD_KEYS: &str = "QWERTYUIOPASDFGHJKLZXCVBNM;/,.[]\\'";
const LAYOUT_KEYS: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ[]\\;',./";
const HEADS: [&str; 27] = [
    "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "zh", "ch", "sh", "r",
    "z", "c", "s", "A", "E", "O", "W", "Y", "YU",
];
const FINALS: [&str; 35] = [
    "a", "ai", "an", "ang", "ao", "e", "ei", "en", "eng", "er", "i", "ia", "ian", "iang", "iao",
    "ie", "in", "ing", "iong", "iu", "o", "ong", "ou", "u", "ua", "uai", "uan", "uang", "ui", "un",
    "uo", "v", "van", "ve", "vn",
];
const TONES: [&str; 5] = ["tone1", "tone2", "tone3", "tone4", "tone5"];

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErgonomicFixture {
    pub version: String,
    pub verification_status: String,
    pub source: String,
    pub source_hashes: HashMap<String, String>,
    pub token_order: Vec<String>,
    pub load_model: TokenLoadModel,
    pub moving_hand: MovingHandModel,
    pub expected: HashMap<String, ExpectedErgonomics>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpectedErgonomics {
    pub layout: Vec<String>,
    pub loads: LoadDiagnostics,
    pub moving_hand: HashMap<String, MovingHandSummary>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenLoadModel {
    pub keys: String,
    pub layout_key_alphabet: String,
    pub tracks: Vec<String>,
    pub masses: Vec<Vec<f64>>,
    pub right_pinky_keys: String,
    pub home_keys: String,
    pub track_roles: TrackRoles,
}

#[derive(Clone, Debug, Deserialize)]
pub struct TrackRoles {
    pub s2: String,
    pub c4: String,
    pub wx: String,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
pub struct LoadDiagnostics {
    pub rp_s2: f64,
    pub rp_max: f64,
    pub home_s2: f64,
    pub home_c4: f64,
    pub home_wx: f64,
    pub home_floor: f64,
    pub w_max: f64,
    pub y_max: f64,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErgonomicGuards {
    pub max_rp_s2: Option<f64>,
    pub max_rp: Option<f64>,
    pub max_w: Option<f64>,
    pub max_y: Option<f64>,
    pub min_mx_score: Option<f64>,
}

impl ErgonomicGuards {
    pub const fn is_empty(self) -> bool {
        self.max_rp_s2.is_none()
            && self.max_rp.is_none()
            && self.max_w.is_none()
            && self.max_y.is_none()
            && self.min_mx_score.is_none()
    }

    pub fn validate(
        self,
        verification: crate::MetricVerification,
        metrics: &crate::ErgonomicFrontierMetrics,
    ) -> Result<(), String> {
        if verification != crate::MetricVerification::Exact {
            return Ok(());
        }
        let loads = metrics.loads;
        if self.max_rp_s2.is_some_and(|limit| loads.rp_s2 > limit) {
            return Err(format!(
                "right-pinky S2 load {} exceeds guard {}",
                loads.rp_s2,
                self.max_rp_s2.unwrap_or_default()
            ));
        }
        if self.max_rp.is_some_and(|limit| loads.rp_max > limit) {
            return Err(format!(
                "right-pinky peak load {} exceeds guard {}",
                loads.rp_max,
                self.max_rp.unwrap_or_default()
            ));
        }
        if self.max_w.is_some_and(|limit| loads.w_max > limit) {
            return Err(format!(
                "W peak load {} exceeds guard {}",
                loads.w_max,
                self.max_w.unwrap_or_default()
            ));
        }
        if self.max_y.is_some_and(|limit| loads.y_max > limit) {
            return Err(format!(
                "Y peak load {} exceeds guard {}",
                loads.y_max,
                self.max_y.unwrap_or_default()
            ));
        }
        if let Some(limit) = self.min_mx_score {
            let score = metrics
                .mx_score
                .ok_or("moving-hand score guard requires an evaluated corpus")?;
            if score < limit {
                return Err(format!("moving-hand score {score} is below guard {limit}"));
            }
        }
        Ok(())
    }
}

impl ErgonomicFixture {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, String> {
        let text = std::fs::read_to_string(path).map_err(|error| error.to_string())?;
        let fixture: Self = serde_json::from_str(&text).map_err(|error| error.to_string())?;
        if fixture.version != VERSION {
            return Err(format!(
                "unsupported ergonomic fixture version {}",
                fixture.version
            ));
        }
        if !matches!(
            fixture.verification_status.as_str(),
            "exact" | "provisional"
        ) {
            return Err(format!(
                "unknown ergonomic verification status {}",
                fixture.verification_status
            ));
        }
        fixture.load_model.validate(&fixture.token_order)?;
        fixture.moving_hand.validate()?;
        if fixture
            .source_hashes
            .values()
            .any(|hash| hash.len() != 64 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()))
        {
            return Err("ergonomic source hash is not SHA-256 hex".to_owned());
        }
        for (id, expected) in &fixture.expected {
            if expected.layout.len() != 67
                || expected
                    .layout
                    .iter()
                    .any(|key| key.chars().count() != 1 || !LAYOUT_KEYS.contains(key))
            {
                return Err(format!("expected layout for {id} is not a 67-token layout"));
            }
        }
        Ok(fixture)
    }
}

impl TokenLoadModel {
    pub fn validate(&self, token_order: &[String]) -> Result<(), String> {
        let canonical: Vec<_> = HEADS
            .into_iter()
            .chain(FINALS)
            .chain(TONES)
            .map(str::to_owned)
            .collect();
        if token_order != canonical {
            return Err("ergonomic token order differs from canonical 27+35+5".to_owned());
        }
        if self.keys != LOAD_KEYS {
            return Err("ergonomic load key order differs from frozen R11 order".to_owned());
        }
        if self.layout_key_alphabet != LAYOUT_KEYS {
            return Err("ergonomic layout key order differs from the native kernel".to_owned());
        }
        if self.tracks.len() != 20
            || self.masses.len() != 20
            || self.masses.iter().any(|row| row.len() != 67)
        {
            return Err("ergonomic load matrix must be 20x67".to_owned());
        }
        if self
            .masses
            .iter()
            .flatten()
            .any(|value| !value.is_finite() || *value < 0.0)
        {
            return Err("ergonomic load matrix contains invalid mass".to_owned());
        }
        for role in [
            &self.track_roles.s2,
            &self.track_roles.c4,
            &self.track_roles.wx,
        ] {
            if !self.tracks.contains(role) {
                return Err(format!("ergonomic load track role {role:?} is absent"));
            }
        }
        if self
            .right_pinky_keys
            .chars()
            .chain(self.home_keys.chars())
            .any(|key| !self.keys.contains(key))
        {
            return Err("ergonomic load key group contains an unknown key".to_owned());
        }
        Ok(())
    }

    pub fn diagnose(&self, layout: &RegularLayout) -> Result<LoadDiagnostics, String> {
        if layout.head_keys.len() != 27 || layout.final_keys.len() != 35 {
            return Err("regular layout must contain 27 heads and 35 finals".to_owned());
        }
        let alphabet: Vec<char> = self.layout_key_alphabet.chars().collect();
        let mapped: Vec<char> = layout
            .head_keys
            .iter()
            .chain(&layout.final_keys)
            .chain(&layout.tone)
            .map(|&index| {
                alphabet
                    .get(usize::from(index))
                    .copied()
                    .ok_or_else(|| format!("layout key index {index} is outside the alphabet"))
            })
            .collect::<Result<_, _>>()?;

        let mut right_pinky = Vec::with_capacity(20);
        let mut home = Vec::with_capacity(20);
        let mut w = Vec::with_capacity(20);
        let mut y = Vec::with_capacity(20);
        for row in &self.masses {
            let sum = |keys: &str| {
                row.iter()
                    .zip(&mapped)
                    .filter(|(_, key)| keys.contains(**key))
                    .map(|(mass, _)| mass)
                    .sum::<f64>()
            };
            right_pinky.push(sum(&self.right_pinky_keys));
            home.push(sum(&self.home_keys));
            w.push(sum("W"));
            y.push(sum("Y"));
        }
        let track = |name: &str| {
            self.tracks
                .iter()
                .position(|track| track == name)
                .ok_or_else(|| format!("load track {name:?} is absent"))
        };
        let s2 = track(&self.track_roles.s2)?;
        let c4 = track(&self.track_roles.c4)?;
        let wx = track(&self.track_roles.wx)?;
        let maximum = |values: &[f64]| values.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        Ok(LoadDiagnostics {
            rp_s2: right_pinky[s2],
            rp_max: maximum(&right_pinky),
            home_s2: home[s2],
            home_c4: home[c4],
            home_wx: home[wx],
            home_floor: home[c4].min(home[wx]),
            w_max: maximum(&w),
            y_max: maximum(&y),
        })
    }
}
