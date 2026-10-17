use crate::{ErgonomicMetricSchema, FrontierLogProvenance, FrontierPoint, RegularLayout};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet};

pub const EXPLORATION_ARCHIVE_VERSION: &str = "ckt-v4-exploration-archive-1";
pub const EXPLORATION_PLAN_VERSION: &str = "ckt-v4-exploration-plan-1";

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorationArchive {
    pub version: String,
    pub generation: usize,
    pub capacity: [u8; 2],
    pub corpus_hash: String,
    pub scheme_hash: String,
    pub max_memory: Option<usize>,
    pub max_displaced_initials: Option<usize>,
    pub max_displaced_vowels: Option<usize>,
    pub proposal_policy: String,
    pub ergonomic_schema: ErgonomicMetricSchema,
    pub ergonomic_contract: Option<String>,
    pub entries: Vec<ExplorationEntry>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorationEntry {
    pub state_key: String,
    pub point: FrontierPoint,
    pub first_seen_generation: usize,
    pub last_seen_generation: usize,
    pub evaluations: usize,
    pub sources: Vec<String>,
    pub last_seeded_generation: Option<usize>,
}

#[derive(Clone, Debug)]
pub struct ExplorationBatch {
    pub source: String,
    pub provenance: FrontierLogProvenance,
    pub points: Vec<FrontierPoint>,
}

#[derive(Clone, Copy, Debug)]
pub struct ExplorationConfig {
    pub seed_count: usize,
    pub max_ckt_delta: f64,
    pub novelty_distance: usize,
    pub basin_radius: usize,
    pub basin_support: usize,
}

impl Default for ExplorationConfig {
    fn default() -> Self {
        Self {
            seed_count: 8,
            max_ckt_delta: 0.35,
            novelty_distance: 8,
            basin_radius: 5,
            basin_support: 3,
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorationPlan {
    pub version: String,
    pub generation: usize,
    pub imported_new_states: usize,
    pub total_states: usize,
    pub best_ckt_v4: f64,
    pub seeds: Vec<SeedRecommendation>,
    pub review_queue: Vec<ReviewCandidate>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedRecommendation {
    pub rank: usize,
    pub reason: String,
    pub state_key: String,
    pub nearest_prior_distance: Option<usize>,
    pub coverage_cell: String,
    pub coverage_count: usize,
    pub point: FrontierPoint,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewCandidate {
    pub kind: String,
    pub rationale: String,
    pub state_key: String,
    pub nearest_prior_distance: Option<usize>,
    pub new_neighbour_support: usize,
    pub point: FrontierPoint,
}

pub fn layout_state_bytes(layout: &RegularLayout) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(2 + 27 + 35 + 5);
    bytes.extend_from_slice(&layout.capacity);
    bytes.extend_from_slice(&layout.head_keys);
    bytes.extend_from_slice(&layout.final_keys);
    bytes.extend_from_slice(&layout.tone);
    bytes
}

pub fn layout_state_key(layout: &RegularLayout) -> String {
    layout_state_bytes(layout)
        .into_iter()
        .map(|value| format!("{value:02x}"))
        .collect()
}

pub fn layout_distance(left: &RegularLayout, right: &RegularLayout) -> Result<usize, String> {
    if left.capacity != right.capacity
        || left.head_keys.len() != right.head_keys.len()
        || left.final_keys.len() != right.final_keys.len()
    {
        return Err("layout distance requires matching topology and capacity".to_owned());
    }
    Ok(left
        .head_keys
        .iter()
        .chain(&left.final_keys)
        .chain(&left.tone)
        .zip(
            right
                .head_keys
                .iter()
                .chain(&right.final_keys)
                .chain(&right.tone),
        )
        .filter(|(left, right)| left != right)
        .count())
}

impl ExplorationArchive {
    pub fn empty(provenance: &FrontierLogProvenance, capacity: [u8; 2]) -> Self {
        Self {
            version: EXPLORATION_ARCHIVE_VERSION.to_owned(),
            generation: 0,
            capacity,
            corpus_hash: provenance.corpus_hash.clone(),
            scheme_hash: provenance.scheme_hash.clone(),
            max_memory: provenance.max_memory,
            max_displaced_initials: provenance.max_displaced_initials,
            max_displaced_vowels: provenance.max_displaced_vowels,
            proposal_policy: provenance.proposal_policy.clone(),
            ergonomic_schema: provenance.ergonomic_schema,
            ergonomic_contract: provenance.ergonomic_contract.clone(),
            entries: Vec::new(),
        }
    }

    pub fn state_keys(&self) -> BTreeSet<String> {
        self.entries
            .iter()
            .map(|entry| entry.state_key.clone())
            .collect()
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.version != EXPLORATION_ARCHIVE_VERSION {
            return Err(format!(
                "unsupported exploration archive version {}",
                self.version
            ));
        }
        let mut seen = BTreeSet::new();
        for entry in &self.entries {
            entry.point.layout.validate_structure()?;
            if entry.point.layout.capacity != self.capacity
                || entry.state_key != layout_state_key(&entry.point.layout)
                || !seen.insert(&entry.state_key)
                || !entry.point.metrics.ckt_v4.is_finite()
            {
                return Err("exploration archive contains an invalid or duplicate entry".to_owned());
            }
        }
        Ok(())
    }
}

pub fn update_and_plan(
    archive: Option<ExplorationArchive>,
    batches: Vec<ExplorationBatch>,
    generation: usize,
    config: ExplorationConfig,
) -> Result<(ExplorationArchive, ExplorationPlan), String> {
    if batches.is_empty() && archive.is_none() {
        return Err("exploration planning requires an archive or at least one log".to_owned());
    }
    if config.seed_count == 0
        || !config.max_ckt_delta.is_finite()
        || config.max_ckt_delta < 0.0
        || config.basin_support == 0
    {
        return Err("invalid exploration planner configuration".to_owned());
    }

    let first_point = batches.iter().flat_map(|batch| &batch.points).next();
    let mut archive = match archive {
        Some(value) => value,
        None => {
            let first_batch = batches.first().ok_or("no exploration log was provided")?;
            let point = first_point.ok_or("exploration logs contain no points")?;
            ExplorationArchive::empty(&first_batch.provenance, point.layout.capacity)
        }
    };
    archive.validate()?;
    if generation <= archive.generation && !archive.entries.is_empty() {
        return Err(format!(
            "generation {generation} must be newer than archived generation {}",
            archive.generation
        ));
    }
    let prior_entries = archive.entries.clone();
    let prior_keys = archive.state_keys();
    let mut by_key: BTreeMap<_, _> = archive
        .entries
        .drain(..)
        .map(|entry| (entry.state_key.clone(), entry))
        .collect();

    for batch in batches {
        validate_provenance(&archive, &batch.provenance)?;
        for point in batch.points {
            point.layout.validate_structure()?;
            if point.layout.capacity != archive.capacity || !point.metrics.ckt_v4.is_finite() {
                return Err(format!("{} contains an incompatible point", batch.source));
            }
            let key = layout_state_key(&point.layout);
            if let Some(entry) = by_key.get_mut(&key) {
                if (entry.point.metrics.ckt_v4 - point.metrics.ckt_v4).abs() > 1e-8 {
                    return Err(format!("state {key} has inconsistent CKT v4 scores"));
                }
                entry.last_seen_generation = generation;
                entry.evaluations += 1;
                if !entry.sources.contains(&batch.source) {
                    entry.sources.push(batch.source.clone());
                    entry.sources.sort();
                }
            } else {
                by_key.insert(
                    key.clone(),
                    ExplorationEntry {
                        state_key: key,
                        point,
                        first_seen_generation: generation,
                        last_seen_generation: generation,
                        evaluations: 1,
                        sources: vec![batch.source.clone()],
                        last_seeded_generation: None,
                    },
                );
            }
        }
    }
    archive.entries = by_key.into_values().collect();
    archive
        .entries
        .sort_by(|left, right| left.state_key.cmp(&right.state_key));
    archive.generation = generation;

    let imported_new_states = archive
        .entries
        .iter()
        .filter(|entry| !prior_keys.contains(&entry.state_key))
        .count();
    let best_ckt_v4 = archive
        .entries
        .iter()
        .map(|entry| entry.point.metrics.ckt_v4)
        .reduce(f64::min)
        .ok_or("exploration archive contains no points")?;
    let coverage = coverage_counts(&archive.entries);
    let mut eligible: Vec<_> = archive
        .entries
        .iter()
        .enumerate()
        .filter(|(_, entry)| entry.point.metrics.ckt_v4 <= best_ckt_v4 + config.max_ckt_delta)
        .map(|(index, _)| index)
        .collect();
    eligible
        .sort_by(|&left, &right| candidate_order(&archive.entries[left], &archive.entries[right]));
    let selected = select_seeds(
        &archive.entries,
        &eligible,
        &prior_entries,
        &coverage,
        generation,
        config.seed_count,
    )?;
    let mut seeds = Vec::new();
    for (rank, (index, reason)) in selected.into_iter().enumerate() {
        let entry = &archive.entries[index];
        seeds.push(SeedRecommendation {
            rank: rank + 1,
            reason,
            state_key: entry.state_key.clone(),
            nearest_prior_distance: nearest_distance(&entry.point.layout, &prior_entries)?,
            coverage_cell: coverage_cell(&entry.point),
            coverage_count: coverage[&coverage_cell(&entry.point)],
            point: entry.point.clone(),
        });
        archive.entries[index].last_seeded_generation = Some(generation);
    }
    let review_queue = review_candidates(
        &archive.entries,
        &prior_entries,
        generation,
        best_ckt_v4,
        config,
    )?;
    let plan = ExplorationPlan {
        version: EXPLORATION_PLAN_VERSION.to_owned(),
        generation,
        imported_new_states,
        total_states: archive.entries.len(),
        best_ckt_v4,
        seeds,
        review_queue,
    };
    Ok((archive, plan))
}

fn validate_provenance(
    archive: &ExplorationArchive,
    provenance: &FrontierLogProvenance,
) -> Result<(), String> {
    if archive.corpus_hash != provenance.corpus_hash
        || archive.scheme_hash != provenance.scheme_hash
        || archive.max_memory != provenance.max_memory
        || archive.max_displaced_initials != provenance.max_displaced_initials
        || archive.max_displaced_vowels != provenance.max_displaced_vowels
        || archive.proposal_policy != provenance.proposal_policy
        || archive.ergonomic_schema != provenance.ergonomic_schema
        || archive.ergonomic_contract != provenance.ergonomic_contract
    {
        return Err("exploration log provenance/search contract differs from archive".to_owned());
    }
    Ok(())
}

fn coverage_counts(entries: &[ExplorationEntry]) -> BTreeMap<String, usize> {
    let mut result = BTreeMap::new();
    for entry in entries {
        *result.entry(coverage_cell(&entry.point)).or_default() += 1;
    }
    result
}

fn bucket(value: f64, width: f64) -> i64 {
    (value / width).floor() as i64
}

fn coverage_cell(point: &FrontierPoint) -> String {
    let metrics = point.metrics;
    let (rp, home, mx) = metrics.ergonomics.map_or((-1, -1, -1), |ergonomics| {
        (
            bucket(ergonomics.loads.rp_max, 0.0025),
            bucket(ergonomics.loads.home_floor, 0.01),
            ergonomics.mx_score.map_or(-1, |value| bucket(value, 1.0)),
        )
    });
    format!(
        "c{}-m{}-d{}-v{}-rp{}-h{}-mx{}",
        bucket(metrics.ckt_v4, 0.05),
        metrics.memory,
        metrics.displaced_initials,
        metrics.displaced_vowels,
        rp,
        home,
        mx
    )
}

fn candidate_order(left: &ExplorationEntry, right: &ExplorationEntry) -> Ordering {
    left.point
        .metrics
        .ckt_v4
        .total_cmp(&right.point.metrics.ckt_v4)
        .then_with(|| left.state_key.cmp(&right.state_key))
}

fn nearest_distance(
    layout: &RegularLayout,
    entries: &[ExplorationEntry],
) -> Result<Option<usize>, String> {
    entries
        .iter()
        .filter(|entry| entry.state_key != layout_state_key(layout))
        .map(|entry| layout_distance(layout, &entry.point.layout))
        .collect::<Result<Vec<_>, _>>()
        .map(|values| values.into_iter().min())
}

fn select_seeds(
    entries: &[ExplorationEntry],
    eligible: &[usize],
    prior: &[ExplorationEntry],
    coverage: &BTreeMap<String, usize>,
    generation: usize,
    seed_count: usize,
) -> Result<Vec<(usize, String)>, String> {
    let mut selected = Vec::new();
    let mut used = BTreeSet::new();
    let fresh: Vec<_> = eligible
        .iter()
        .copied()
        .filter(|&index| entries[index].first_seen_generation == generation)
        .collect();
    let preferred = if fresh.is_empty() { eligible } else { &fresh };
    if let Some(&best) = preferred.first() {
        let reason = if fresh.is_empty() {
            "best-available-ckt-v4"
        } else {
            "best-new-ckt-v4"
        };
        selected.push((best, reason.to_owned()));
        used.insert(best);
    }
    for metric in ["right-pinky", "home-row", "moving-hand", "memory"] {
        if selected.len() >= seed_count {
            break;
        }
        let candidate = preferred
            .iter()
            .copied()
            .filter(|index| !used.contains(index))
            .min_by(|&left, &right| metric_order(metric, &entries[left], &entries[right]));
        if let Some(index) = candidate {
            selected.push((index, format!("metric-extreme:{metric}")));
            used.insert(index);
        }
    }
    fill_diverse(
        entries,
        preferred,
        prior,
        coverage,
        generation,
        seed_count,
        &mut selected,
        &mut used,
    )?;
    fill_diverse(
        entries,
        eligible,
        prior,
        coverage,
        generation,
        seed_count,
        &mut selected,
        &mut used,
    )?;
    Ok(selected)
}

#[allow(clippy::too_many_arguments)]
fn fill_diverse(
    entries: &[ExplorationEntry],
    candidates: &[usize],
    prior: &[ExplorationEntry],
    coverage: &BTreeMap<String, usize>,
    generation: usize,
    seed_count: usize,
    selected: &mut Vec<(usize, String)>,
    used: &mut BTreeSet<usize>,
) -> Result<(), String> {
    while selected.len() < seed_count && candidates.iter().any(|index| !used.contains(index)) {
        let candidate = candidates
            .iter()
            .copied()
            .filter(|index| !used.contains(index))
            .max_by(|&left, &right| {
                diversity_tuple(
                    &entries[left],
                    entries,
                    selected,
                    prior,
                    coverage,
                    generation,
                )
                .cmp(&diversity_tuple(
                    &entries[right],
                    entries,
                    selected,
                    prior,
                    coverage,
                    generation,
                ))
                .then_with(|| candidate_order(&entries[right], &entries[left]))
            })
            .ok_or("failed to select a diverse exploration seed")?;
        selected.push((candidate, "novel-sparse-coverage".to_owned()));
        used.insert(candidate);
    }
    Ok(())
}

fn metric_order(metric: &str, left: &ExplorationEntry, right: &ExplorationEntry) -> Ordering {
    let left_metrics = left.point.metrics;
    let right_metrics = right.point.metrics;
    let value = |entry: &ExplorationEntry| match metric {
        "right-pinky" => entry
            .point
            .metrics
            .ergonomics
            .map_or(f64::INFINITY, |value| value.loads.rp_max),
        "home-row" => entry
            .point
            .metrics
            .ergonomics
            .map_or(f64::INFINITY, |value| -value.loads.home_floor),
        "moving-hand" => entry
            .point
            .metrics
            .ergonomics
            .and_then(|value| value.mx_score)
            .map_or(f64::INFINITY, |value| -value),
        "memory" => entry.point.metrics.memory as f64,
        _ => f64::INFINITY,
    };
    value(left)
        .total_cmp(&value(right))
        .then_with(|| left_metrics.ckt_v4.total_cmp(&right_metrics.ckt_v4))
        .then_with(|| left.state_key.cmp(&right.state_key))
}

fn diversity_tuple(
    entry: &ExplorationEntry,
    entries: &[ExplorationEntry],
    selected: &[(usize, String)],
    prior: &[ExplorationEntry],
    coverage: &BTreeMap<String, usize>,
    generation: usize,
) -> (usize, usize, usize, usize, usize) {
    let selected_distance = selected
        .iter()
        .filter_map(|(index, _)| {
            layout_distance(&entry.point.layout, &entries[*index].point.layout).ok()
        })
        .min()
        .unwrap_or(usize::MAX / 4);
    let prior_distance = nearest_distance(&entry.point.layout, prior)
        .ok()
        .flatten()
        .unwrap_or(usize::MAX / 4);
    let fresh = usize::from(entry.first_seen_generation == generation);
    let not_recently_seeded = usize::from(
        entry
            .last_seeded_generation
            .is_none_or(|value| value + 1 < generation),
    );
    let sparse = usize::MAX - coverage[&coverage_cell(&entry.point)];
    (
        fresh,
        not_recently_seeded,
        selected_distance,
        prior_distance,
        sparse,
    )
}

fn review_candidates(
    entries: &[ExplorationEntry],
    prior: &[ExplorationEntry],
    generation: usize,
    best: f64,
    config: ExplorationConfig,
) -> Result<Vec<ReviewCandidate>, String> {
    if prior.is_empty() {
        return Ok(Vec::new());
    }
    let mut new_entries: Vec<_> = entries
        .iter()
        .filter(|entry| {
            entry.first_seen_generation == generation
                && entry.point.metrics.ckt_v4 <= best + config.max_ckt_delta
        })
        .collect();
    new_entries.sort_by(|left, right| candidate_order(left, right));
    let prior_best = prior
        .iter()
        .map(|entry| entry.point.metrics.ckt_v4)
        .reduce(f64::min);
    let mut result: Vec<ReviewCandidate> = Vec::new();
    for entry in &new_entries {
        let prior_distance = nearest_distance(&entry.point.layout, prior)?;
        let support = new_entries
            .iter()
            .filter(|other| other.state_key != entry.state_key)
            .filter(|other| {
                layout_distance(&entry.point.layout, &other.point.layout)
                    .is_ok_and(|distance| distance <= config.basin_radius)
            })
            .count()
            + 1;
        let far_from_prior = prior_distance.is_none_or(|value| value >= config.novelty_distance);
        let improves_prior = prior_best.is_none_or(|value| entry.point.metrics.ckt_v4 < value);
        let (kind, rationale) = if far_from_prior && support >= config.basin_support {
            (
                "emerging-basin",
                format!(
                    "{support} competitive new states cluster within radius {}; nearest prior distance is {:?}",
                    config.basin_radius, prior_distance
                ),
            )
        } else if far_from_prior && improves_prior {
            (
                "isolated-breakthrough",
                format!(
                    "improves the prior best while nearest prior distance is {:?}; verify before allocating a basin campaign",
                    prior_distance
                ),
            )
        } else {
            continue;
        };
        if result.iter().any(|candidate| {
            layout_distance(&entry.point.layout, &candidate.point.layout)
                .is_ok_and(|distance| distance <= config.basin_radius)
        }) {
            continue;
        }
        result.push(ReviewCandidate {
            kind: kind.to_owned(),
            rationale,
            state_key: entry.state_key.clone(),
            nearest_prior_distance: prior_distance,
            new_neighbour_support: support,
            point: entry.point.clone(),
        });
    }
    result.sort_by(|left, right| {
        left.point
            .metrics
            .ckt_v4
            .total_cmp(&right.point.metrics.ckt_v4)
            .then_with(|| left.state_key.cmp(&right.state_key))
    });
    Ok(result)
}
