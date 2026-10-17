use crate::compact::PackedCode;
use crate::incremental::OutcomeChange;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Contract {
    Traditional21x21,
    FourCodeTop,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Character,
    Word2,
    Word3,
    Word4,
}

impl Kind {
    pub const ALL: [Self; 4] = [Self::Character, Self::Word2, Self::Word3, Self::Word4];

    pub const fn index(self) -> usize {
        match self {
            Self::Character => 0,
            Self::Word2 => 1,
            Self::Word3 => 2,
            Self::Word4 => 3,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum Pool {
    CharBase,
    CharAux1,
    CharAux2,
    WordFour,
    WordFive,
    WordSix,
    Word3Three,
    Word3FourB,
    Word3FiveBb,
}

impl Pool {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "char:base" => Ok(Self::CharBase),
            "char:aux1" => Ok(Self::CharAux1),
            "char:aux2" => Ok(Self::CharAux2),
            "word:four" => Ok(Self::WordFour),
            "word:five" => Ok(Self::WordFive),
            "word:six" => Ok(Self::WordSix),
            "word3:three" => Ok(Self::Word3Three),
            "word3:four-b" => Ok(Self::Word3FourB),
            "word3:five-bb" => Ok(Self::Word3FiveBb),
            _ => Err(format!("unknown CKT v4 pool {value:?}")),
        }
    }

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::CharBase => "char:base",
            Self::CharAux1 => "char:aux1",
            Self::CharAux2 => "char:aux2",
            Self::WordFour => "word:four",
            Self::WordFive => "word:five",
            Self::WordSix => "word:six",
            Self::Word3Three => "word3:three",
            Self::Word3FourB => "word3:four-b",
            Self::Word3FiveBb => "word3:five-bb",
        }
    }
}

pub fn stage_pools(contract: Contract, kind: Kind) -> &'static [Pool] {
    const CHARACTER: &[Pool] = &[Pool::CharBase, Pool::CharAux1, Pool::CharAux2];
    const WORD: &[Pool] = &[Pool::WordFour, Pool::WordFive, Pool::WordSix];
    const WORD3_TRADITIONAL: &[Pool] = &[Pool::Word3Three, Pool::Word3FourB, Pool::Word3FiveBb];
    const WORD3_FOUR_CODE_TOP: &[Pool] = &[
        Pool::Word3Three,
        Pool::WordFour,
        Pool::WordFive,
        Pool::WordSix,
    ];
    match (contract, kind) {
        (_, Kind::Character) => CHARACTER,
        (_, Kind::Word2 | Kind::Word4) => WORD,
        (Contract::Traditional21x21, Kind::Word3) => WORD3_TRADITIONAL,
        (Contract::FourCodeTop, Kind::Word3) => WORD3_FOUR_CODE_TOP,
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Stage {
    pub order: u8,
    pub pool: Pool,
    /// Codes must be de-duplicated and kept in JS lexical order by the adapter.
    pub codes: Vec<PackedCode>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Row {
    pub id: String,
    pub text: String,
    pub kind: Kind,
    pub weight: f64,
    pub base_length: u8,
    pub stages: Vec<Stage>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Outcome {
    pub row_index: usize,
    pub code: PackedCode,
    pub code_length: u8,
    pub aux_count: u8,
    pub rank: usize,
    pub pool: Pool,
    pub motor_upper_ms: f64,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CognitiveParameters {
    pub first_aux_ms: f64,
    pub second_aux_ms: f64,
    pub selection_decision_ms: f64,
    pub scan_per_candidate_ms: f64,
    pub selection_action_ms: f64,
    pub page_size: usize,
    pub page_action_ms: f64,
}

impl Default for CognitiveParameters {
    fn default() -> Self {
        Self {
            first_aux_ms: 300.0,
            second_aux_ms: 300.0,
            selection_decision_ms: 600.0,
            scan_per_candidate_ms: 50.0,
            selection_action_ms: 0.0,
            page_size: 9,
            page_action_ms: 300.0,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackSummary {
    pub count: usize,
    pub total_weight: f64,
    pub motor_upper_ms: f64,
    pub cognitive_ms: f64,
    pub effective_ms: f64,
    pub first_aux_rate: f64,
    pub second_aux_rate: f64,
    pub selection_rate: f64,
    pub mean_terminal_rank: f64,
    pub mean_keys: f64,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Summary {
    tracks: [Option<TrackSummary>; 4],
}

#[derive(Clone, Copy, Debug, Default)]
struct TrackAccumulator {
    count: usize,
    total_weight: f64,
    motor: f64,
    cognitive: f64,
    first_aux: f64,
    second_aux: f64,
    selection: f64,
    rank: f64,
    keys: f64,
}

#[derive(Clone, Debug)]
pub struct IncrementalSummary {
    tracks: [TrackAccumulator; 4],
    parameters: CognitiveParameters,
}

impl Summary {
    pub fn track(&self, kind: Kind) -> Option<&TrackSummary> {
        self.tracks[kind.index()].as_ref()
    }
}

impl IncrementalSummary {
    pub fn new(
        rows: &[Row],
        outcomes: &[Outcome],
        parameters: CognitiveParameters,
    ) -> Result<Self, String> {
        if rows.len() != outcomes.len() {
            return Err("rows/outcomes length mismatch".to_owned());
        }
        let mut result = Self {
            tracks: [TrackAccumulator::default(); 4],
            parameters,
        };
        for outcome in outcomes {
            let row = rows
                .get(outcome.row_index)
                .ok_or("outcome row index is outside rows")?;
            result.tracks[row.kind.index()].add(row, outcome, parameters, 1.0);
        }
        Ok(result)
    }

    pub fn apply_changes(&mut self, rows: &[Row], changes: &[OutcomeChange]) -> Result<(), String> {
        for change in changes {
            let row = rows
                .get(change.row_index)
                .ok_or("outcome change row index is outside rows")?;
            let track = &mut self.tracks[row.kind.index()];
            track.add(row, &change.old, self.parameters, -1.0);
            track.add(row, &change.new, self.parameters, 1.0);
        }
        Ok(())
    }

    pub fn summary(&self) -> Summary {
        let mut summary = Summary::default();
        for kind in Kind::ALL {
            let track = self.tracks[kind.index()];
            if track.count == 0 || track.total_weight <= 0.0 {
                continue;
            }
            let total = track.total_weight;
            summary.tracks[kind.index()] = Some(TrackSummary {
                count: track.count,
                total_weight: total,
                motor_upper_ms: track.motor / total,
                cognitive_ms: track.cognitive / total,
                effective_ms: (track.motor + track.cognitive) / total,
                first_aux_rate: track.first_aux / total,
                second_aux_rate: track.second_aux / total,
                selection_rate: track.selection / total,
                mean_terminal_rank: track.rank / total,
                mean_keys: track.keys / total,
            });
        }
        summary
    }
}

impl TrackAccumulator {
    fn add(&mut self, row: &Row, outcome: &Outcome, p: CognitiveParameters, sign: f64) {
        let weight = row.weight * sign;
        let cognitive = cognitive_ms(outcome, p);
        self.motor += weight * outcome.motor_upper_ms;
        self.cognitive += weight * cognitive;
        self.first_aux += weight * f64::from(outcome.aux_count >= 1);
        self.second_aux += weight * f64::from(outcome.aux_count >= 2);
        self.selection += weight * f64::from(outcome.rank > 1);
        self.rank += weight * outcome.rank as f64;
        self.keys += weight * f64::from(outcome.code_length);
        if sign > 0.0 {
            self.count += 1;
            self.total_weight += row.weight;
        } else {
            self.count -= 1;
            self.total_weight -= row.weight;
        }
    }
}

fn cognitive_ms(outcome: &Outcome, p: CognitiveParameters) -> f64 {
    let first = if outcome.aux_count >= 1 {
        p.first_aux_ms
    } else {
        0.0
    };
    let second = if outcome.aux_count >= 2 {
        p.second_aux_ms
    } else {
        0.0
    };
    let selection = if outcome.rank > 1 {
        let page_size = p.page_size.max(2);
        let inspected = (outcome.rank - 1) as f64;
        p.selection_decision_ms
            + inspected * p.scan_per_candidate_ms
            + p.selection_action_ms
            + ((outcome.rank - 1) / page_size) as f64 * p.page_action_ms
    } else {
        0.0
    };
    first + second + selection
}

#[derive(Clone, Copy)]
struct ActiveState {
    row: usize,
    stage: usize,
}

type BucketKey = (Pool, PackedCode);

fn js_string_cmp(left: &str, right: &str) -> Ordering {
    left.encode_utf16().cmp(right.encode_utf16())
}

fn row_cmp(left: usize, right: usize, rows: &[Row]) -> Ordering {
    let a = &rows[left];
    let b = &rows[right];
    b.weight
        .partial_cmp(&a.weight)
        .unwrap_or(Ordering::Equal)
        .then_with(|| js_string_cmp(&a.id, &b.id))
}

fn validate_rows(rows: &[Row]) -> Result<(), String> {
    let mut ids = HashSet::with_capacity(rows.len());
    for row in rows {
        if row.id.is_empty() || !ids.insert(&row.id) {
            return Err(format!("row ids must be present and unique: {:?}", row.id));
        }
        if !row.weight.is_finite() || row.weight <= 0.0 {
            return Err(format!("invalid row weight: {}", row.id));
        }
        if row.base_length == 0 || row.stages.is_empty() {
            return Err(format!(
                "row has invalid base length or no stages: {}",
                row.id
            ));
        }
        let mut prior = 0;
        for stage in &row.stages {
            if stage.order <= prior || stage.codes.is_empty() {
                return Err(format!("invalid stage order/codes: {}", row.id));
            }
            if stage
                .codes
                .iter()
                .any(|code| code.len() != usize::from(stage.order))
            {
                return Err(format!("stage/code length mismatch: {}", row.id));
            }
            let unique: HashSet<_> = stage.codes.iter().collect();
            if unique.len() != stage.codes.len() {
                return Err(format!("duplicate stage code: {}", row.id));
            }
            prior = stage.order;
        }
    }
    Ok(())
}

pub fn resolve<F>(rows: &[Row], motor_cost: F) -> Result<Vec<Outcome>, String>
where
    F: Fn(PackedCode) -> Option<f64>,
{
    validate_rows(rows)?;
    let mut active: Vec<_> = (0..rows.len())
        .map(|row| ActiveState { row, stage: 0 })
        .collect();
    let mut outcomes: Vec<Option<Outcome>> = vec![None; rows.len()];
    let mut orders: Vec<u8> = rows
        .iter()
        .flat_map(|row| row.stages.iter().map(|s| s.order))
        .collect();
    orders.sort_unstable();
    orders.dedup();

    for order in orders {
        let mut buckets: HashMap<BucketKey, Vec<usize>> = HashMap::new();
        for state in &active {
            let stage = &rows[state.row].stages[state.stage];
            if stage.order == order {
                for &code in &stage.codes {
                    buckets
                        .entry((stage.pool, code))
                        .or_default()
                        .push(state.row);
                }
            }
        }
        for bucket in buckets.values_mut() {
            bucket.sort_unstable_by(|&left, &right| row_cmp(left, right, rows));
        }

        let mut next = Vec::with_capacity(active.len());
        for mut state in active {
            let stage = &rows[state.row].stages[state.stage];
            if stage.order != order {
                next.push(state);
                continue;
            }
            let mut best_rank = usize::MAX;
            let mut best_codes = Vec::with_capacity(stage.codes.len());
            for &code in &stage.codes {
                let bucket = buckets
                    .get(&(stage.pool, code))
                    .ok_or_else(|| format!("missing bucket for {}", rows[state.row].id))?;
                let rank = bucket
                    .binary_search_by(|probe| row_cmp(*probe, state.row, rows))
                    .map_err(|_| format!("row absent from its bucket: {}", rows[state.row].id))?
                    + 1;
                match rank.cmp(&best_rank) {
                    Ordering::Less => {
                        best_rank = rank;
                        best_codes.clear();
                        best_codes.push(code);
                    }
                    Ordering::Equal => best_codes.push(code),
                    Ordering::Greater => {}
                }
            }
            let terminal = state.stage + 1 == rows[state.row].stages.len();
            if best_rank == 1 || terminal {
                let mut chosen = None;
                for code in best_codes {
                    let Some(cost) = motor_cost(code) else {
                        continue;
                    };
                    if !cost.is_finite() {
                        continue;
                    }
                    if chosen.is_none_or(|(_, current)| cost < current) {
                        chosen = Some((code, cost));
                    }
                }
                let (code, motor_upper_ms) =
                    chosen.ok_or_else(|| format!("no motor cost for {}", rows[state.row].id))?;
                outcomes[state.row] = Some(Outcome {
                    row_index: state.row,
                    code,
                    code_length: stage.order,
                    aux_count: stage.order.saturating_sub(rows[state.row].base_length),
                    rank: best_rank,
                    pool: stage.pool,
                    motor_upper_ms,
                });
            } else {
                state.stage += 1;
                next.push(state);
            }
        }
        active = next;
    }
    if !active.is_empty() {
        return Err(format!("{} rows remain unresolved", active.len()));
    }
    outcomes
        .into_iter()
        .enumerate()
        .map(|(index, value)| value.ok_or_else(|| format!("row {index} has no outcome")))
        .collect()
}

pub fn summarize(
    rows: &[Row],
    outcomes: &[Outcome],
    p: CognitiveParameters,
) -> Result<Summary, String> {
    if rows.len() != outcomes.len() {
        return Err("rows/outcomes length mismatch".to_owned());
    }
    let mut result = Summary::default();
    for kind in Kind::ALL {
        let selected: Vec<_> = outcomes
            .iter()
            .filter(|out| rows[out.row_index].kind == kind)
            .collect();
        if selected.is_empty() {
            continue;
        }
        let mut track = TrackSummary {
            count: selected.len(),
            ..TrackSummary::default()
        };
        for out in selected {
            let weight = rows[out.row_index].weight;
            let cognition = cognitive_ms(out, p);
            track.total_weight += weight;
            track.motor_upper_ms += weight * out.motor_upper_ms;
            track.cognitive_ms += weight * cognition;
            track.first_aux_rate += weight * f64::from(out.aux_count >= 1);
            track.second_aux_rate += weight * f64::from(out.aux_count >= 2);
            track.selection_rate += weight * f64::from(out.rank > 1);
            track.mean_terminal_rank += weight * out.rank as f64;
            track.mean_keys += weight * f64::from(out.code_length);
        }
        let total = track.total_weight;
        track.motor_upper_ms /= total;
        track.cognitive_ms /= total;
        track.effective_ms = track.motor_upper_ms + track.cognitive_ms;
        track.first_aux_rate /= total;
        track.second_aux_rate /= total;
        track.selection_rate /= total;
        track.mean_terminal_rank /= total;
        track.mean_keys /= total;
        result.tracks[kind.index()] = Some(track);
    }
    Ok(result)
}

pub fn composite_score(
    candidate_modes: &[Summary],
    reference_modes: &[Summary],
) -> Result<f64, String> {
    if candidate_modes.len() != reference_modes.len() || candidate_modes.is_empty() {
        return Err("candidate/reference mode mismatch".to_owned());
    }
    let weights = [1.0_f64, 3.0, 1.0, 1.0];
    let mut total = 0.0;
    let mut weighted = 0.0;
    for (candidate, reference) in candidate_modes.iter().zip(reference_modes) {
        for kind in Kind::ALL {
            let a = candidate
                .track(kind)
                .ok_or_else(|| format!("candidate missing {kind:?}"))?
                .effective_ms;
            let b = reference
                .track(kind)
                .ok_or_else(|| format!("reference missing {kind:?}"))?
                .effective_ms;
            let weight = weights[kind.index()];
            if !(a > 0.0 && b > 0.0) {
                return Err(format!("invalid composite track {kind:?}"));
            }
            weighted += weight * (a / b).powi(4);
            total += weight;
        }
    }
    Ok(10.0 * (weighted / total).powf(0.25))
}
