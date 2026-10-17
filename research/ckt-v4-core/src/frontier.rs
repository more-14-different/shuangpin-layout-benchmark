use crate::{LoadDiagnostics, RegularLayout};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontierMetrics {
    pub ckt_v4: f64,
    pub memory: usize,
    pub displaced_initials: usize,
    pub displaced_vowels: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ergonomics: Option<ErgonomicFrontierMetrics>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MetricVerification {
    Provisional,
    Exact,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MetricDirection {
    Minimize,
    Maximize,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricDefinition {
    pub name: String,
    pub direction: MetricDirection,
    pub verification: MetricVerification,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErgonomicMetricSchema {
    pub loads: Option<MetricVerification>,
    pub moving_hand: Option<MetricVerification>,
}

impl ErgonomicMetricSchema {
    pub fn declarations(self) -> Vec<MetricDefinition> {
        let mut definitions = [
            ("cktV4", MetricDirection::Minimize),
            ("memory", MetricDirection::Minimize),
            ("displacedInitials", MetricDirection::Minimize),
            ("displacedVowels", MetricDirection::Minimize),
        ]
        .into_iter()
        .map(|(name, direction)| MetricDefinition {
            name: name.to_owned(),
            direction,
            verification: MetricVerification::Exact,
        })
        .collect::<Vec<_>>();
        if let Some(verification) = self.loads {
            definitions.extend(
                [
                    ("rightPinkyPeak", MetricDirection::Minimize),
                    ("wPeak", MetricDirection::Minimize),
                    ("yPeak", MetricDirection::Minimize),
                    ("homeRowFloor", MetricDirection::Maximize),
                ]
                .into_iter()
                .map(|(name, direction)| MetricDefinition {
                    name: name.to_owned(),
                    direction,
                    verification,
                }),
            );
        }
        if let Some(verification) = self.moving_hand {
            definitions.push(MetricDefinition {
                name: "movingHandScore".to_owned(),
                direction: MetricDirection::Maximize,
                verification,
            });
        }
        definitions
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErgonomicFrontierMetrics {
    pub loads: LoadDiagnostics,
    pub mx_score: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontierPoint {
    pub metrics: FrontierMetrics,
    pub layout: RegularLayout,
    pub iteration: usize,
}

#[derive(Clone, Debug, Default)]
pub struct ExactFrontier {
    schema: ErgonomicMetricSchema,
    members: Vec<FrontierPoint>,
}

impl ExactFrontier {
    pub const fn new() -> Self {
        Self {
            schema: ErgonomicMetricSchema {
                loads: None,
                moving_hand: None,
            },
            members: Vec::new(),
        }
    }

    pub const fn with_schema(schema: ErgonomicMetricSchema) -> Self {
        Self {
            schema,
            members: Vec::new(),
        }
    }

    pub fn insert(&mut self, point: FrontierPoint) -> Result<bool, String> {
        if !point.metrics.ckt_v4.is_finite() {
            return Err("frontier metrics must be finite".to_owned());
        }
        validate_ergonomic_metrics(point.metrics, self.schema)?;
        point.layout.validate_structure()?;
        let canonical = canonical_layout_bytes(&point.layout);

        if let Some(index) = self
            .members
            .iter()
            .position(|member| canonical_layout_bytes(&member.layout) == canonical)
        {
            if point_order(&point, &self.members[index], self.schema) != Ordering::Less {
                return Ok(false);
            }
            self.members.remove(index);
        }

        for member in &self.members {
            if dominates(member.metrics, point.metrics, self.schema) {
                return Ok(false);
            }
            if metrics_order(member.metrics, point.metrics, self.schema) == Ordering::Equal
                && canonical_layout_bytes(&member.layout) < canonical
            {
                return Ok(false);
            }
        }

        self.members.retain(|member| {
            !dominates(point.metrics, member.metrics, self.schema)
                && !(metrics_order(point.metrics, member.metrics, self.schema) == Ordering::Equal
                    && canonical < canonical_layout_bytes(&member.layout))
        });
        self.members.push(point);
        self.members
            .sort_by(|left, right| point_order(left, right, self.schema));
        Ok(true)
    }

    pub fn members(&self) -> &[FrontierPoint] {
        &self.members
    }
}

pub fn canonical_layout_bytes(layout: &RegularLayout) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(2 + 27 + 35 + 5 + layout.id.len());
    bytes.extend_from_slice(&layout.capacity);
    bytes.extend_from_slice(&layout.head_keys);
    bytes.extend_from_slice(&layout.final_keys);
    bytes.extend_from_slice(&layout.tone);
    bytes.extend_from_slice(layout.id.as_bytes());
    bytes
}

fn dominates(left: FrontierMetrics, right: FrontierMetrics, schema: ErgonomicMetricSchema) -> bool {
    let mut no_worse = left.ckt_v4 <= right.ckt_v4
        && left.memory <= right.memory
        && left.displaced_initials <= right.displaced_initials
        && left.displaced_vowels <= right.displaced_vowels;
    let mut strictly_better = left.ckt_v4 < right.ckt_v4
        || left.memory < right.memory
        || left.displaced_initials < right.displaced_initials
        || left.displaced_vowels < right.displaced_vowels;
    if schema.loads == Some(MetricVerification::Exact) {
        let left = left.ergonomics.expect("validated exact load metrics").loads;
        let right = right
            .ergonomics
            .expect("validated exact load metrics")
            .loads;
        let left_values = [left.rp_max, left.w_max, left.y_max];
        let right_values = [right.rp_max, right.w_max, right.y_max];
        no_worse &= left_values
            .iter()
            .zip(right_values)
            .all(|(left, right)| *left <= right);
        strictly_better |= left_values
            .iter()
            .zip(right_values)
            .any(|(left, right)| *left < right);
        no_worse &= left.home_floor >= right.home_floor;
        strictly_better |= left.home_floor > right.home_floor;
    }
    if schema.moving_hand == Some(MetricVerification::Exact) {
        let left = left
            .ergonomics
            .and_then(|metrics| metrics.mx_score)
            .expect("validated exact moving-hand metric");
        let right = right
            .ergonomics
            .and_then(|metrics| metrics.mx_score)
            .expect("validated exact moving-hand metric");
        no_worse &= left >= right;
        strictly_better |= left > right;
    }
    no_worse && strictly_better
}

fn metrics_order(
    left: FrontierMetrics,
    right: FrontierMetrics,
    schema: ErgonomicMetricSchema,
) -> Ordering {
    let mut ordering = left
        .ckt_v4
        .total_cmp(&right.ckt_v4)
        .then_with(|| left.memory.cmp(&right.memory))
        .then_with(|| left.displaced_initials.cmp(&right.displaced_initials))
        .then_with(|| left.displaced_vowels.cmp(&right.displaced_vowels));
    if schema.loads == Some(MetricVerification::Exact) {
        let left = left.ergonomics.expect("validated exact load metrics").loads;
        let right = right
            .ergonomics
            .expect("validated exact load metrics")
            .loads;
        ordering = ordering
            .then_with(|| left.rp_max.total_cmp(&right.rp_max))
            .then_with(|| left.w_max.total_cmp(&right.w_max))
            .then_with(|| left.y_max.total_cmp(&right.y_max));
        ordering = ordering.then_with(|| right.home_floor.total_cmp(&left.home_floor));
    }
    if schema.moving_hand == Some(MetricVerification::Exact) {
        let left = left
            .ergonomics
            .and_then(|metrics| metrics.mx_score)
            .expect("validated exact moving-hand metric");
        let right = right
            .ergonomics
            .and_then(|metrics| metrics.mx_score)
            .expect("validated exact moving-hand metric");
        ordering = ordering.then_with(|| right.total_cmp(&left));
    }
    ordering
}

fn point_order(
    left: &FrontierPoint,
    right: &FrontierPoint,
    schema: ErgonomicMetricSchema,
) -> Ordering {
    metrics_order(left.metrics, right.metrics, schema)
        .then_with(|| {
            canonical_layout_bytes(&left.layout).cmp(&canonical_layout_bytes(&right.layout))
        })
        .then_with(|| left.iteration.cmp(&right.iteration))
}

pub(crate) fn validate_ergonomic_metrics(
    metrics: FrontierMetrics,
    schema: ErgonomicMetricSchema,
) -> Result<(), String> {
    let ergonomic = metrics.ergonomics;
    if schema.loads == Some(MetricVerification::Exact) {
        let loads = ergonomic
            .ok_or("exact load frontier requires ergonomic metrics")?
            .loads;
        if [loads.rp_max, loads.w_max, loads.y_max, loads.home_floor]
            .into_iter()
            .any(|value| !value.is_finite())
        {
            return Err("exact load frontier metrics must be finite".to_owned());
        }
    }
    if schema.moving_hand == Some(MetricVerification::Exact)
        && !ergonomic
            .and_then(|value| value.mx_score)
            .is_some_and(f64::is_finite)
    {
        return Err("exact moving-hand frontier requires a finite score".to_owned());
    }
    Ok(())
}
