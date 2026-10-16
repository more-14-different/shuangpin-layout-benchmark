use crate::RegularLayout;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontierMetrics {
    pub ckt_v4: f64,
    pub memory: usize,
    pub displaced_initials: usize,
    pub displaced_vowels: usize,
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
    members: Vec<FrontierPoint>,
}

impl ExactFrontier {
    pub const fn new() -> Self {
        Self {
            members: Vec::new(),
        }
    }

    pub fn insert(&mut self, point: FrontierPoint) -> Result<bool, String> {
        if !point.metrics.ckt_v4.is_finite() {
            return Err("frontier metrics must be finite".to_owned());
        }
        point.layout.validate_structure()?;
        let canonical = canonical_layout_bytes(&point.layout);

        if let Some(index) = self
            .members
            .iter()
            .position(|member| canonical_layout_bytes(&member.layout) == canonical)
        {
            if point_order(&point, &self.members[index]) != Ordering::Less {
                return Ok(false);
            }
            self.members.remove(index);
        }

        for member in &self.members {
            if dominates(member.metrics, point.metrics) {
                return Ok(false);
            }
            if metrics_order(member.metrics, point.metrics) == Ordering::Equal
                && canonical_layout_bytes(&member.layout) < canonical
            {
                return Ok(false);
            }
        }

        self.members.retain(|member| {
            !dominates(point.metrics, member.metrics)
                && !(metrics_order(point.metrics, member.metrics) == Ordering::Equal
                    && canonical < canonical_layout_bytes(&member.layout))
        });
        self.members.push(point);
        self.members.sort_by(point_order);
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

fn dominates(left: FrontierMetrics, right: FrontierMetrics) -> bool {
    let no_worse = left.ckt_v4 <= right.ckt_v4
        && left.memory <= right.memory
        && left.displaced_initials <= right.displaced_initials
        && left.displaced_vowels <= right.displaced_vowels;
    let strictly_better = left.ckt_v4 < right.ckt_v4
        || left.memory < right.memory
        || left.displaced_initials < right.displaced_initials
        || left.displaced_vowels < right.displaced_vowels;
    no_worse && strictly_better
}

fn metrics_order(left: FrontierMetrics, right: FrontierMetrics) -> Ordering {
    left.ckt_v4
        .total_cmp(&right.ckt_v4)
        .then_with(|| left.memory.cmp(&right.memory))
        .then_with(|| left.displaced_initials.cmp(&right.displaced_initials))
        .then_with(|| left.displaced_vowels.cmp(&right.displaced_vowels))
}

fn point_order(left: &FrontierPoint, right: &FrontierPoint) -> Ordering {
    metrics_order(left.metrics, right.metrics)
        .then_with(|| {
            canonical_layout_bytes(&left.layout).cmp(&canonical_layout_bytes(&right.layout))
        })
        .then_with(|| left.iteration.cmp(&right.iteration))
}
