use crate::RegularLayout;
use serde::{Deserialize, Serialize};
use std::fmt;

pub const PROPOSAL_KIND_COUNT: usize = 14;
pub const DEFAULT_MAX_PROPOSAL_ATTEMPTS: usize = 256;
pub const NATIVE_ANNEAL_CHECKPOINT_VERSION: &str = "ckt-v4-native-anneal-11";
pub const NATIVE_PROPOSAL_POLICY: &str = "regular-compound-v1";

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
#[repr(usize)]
pub enum ProposalKind {
    ToneSlotSwap,
    ToneKeyReplacement,
    HeadKeySwap,
    HeadKeyReplacement,
    FinalKeySwap,
    FinalKeyReplacement,
    HeadGroupMove,
    HeadGroupSwap,
    FinalTokenMove,
    FinalTokenSwap,
    HeadPairRegroup,
    HeadCycleRegroup,
    FinalPairRegroup,
    FinalCycleRegroup,
}

impl ProposalKind {
    pub const ALL: [Self; PROPOSAL_KIND_COUNT] = [
        Self::ToneSlotSwap,
        Self::ToneKeyReplacement,
        Self::HeadKeySwap,
        Self::HeadKeyReplacement,
        Self::FinalKeySwap,
        Self::FinalKeyReplacement,
        Self::HeadGroupMove,
        Self::HeadGroupSwap,
        Self::FinalTokenMove,
        Self::FinalTokenSwap,
        Self::HeadPairRegroup,
        Self::HeadCycleRegroup,
        Self::FinalPairRegroup,
        Self::FinalCycleRegroup,
    ];

    pub const STRICT_2121_KINDS: [Self; 11] = [
        Self::ToneSlotSwap,
        Self::HeadKeySwap,
        Self::FinalKeySwap,
        Self::HeadGroupMove,
        Self::HeadGroupSwap,
        Self::FinalTokenMove,
        Self::FinalTokenSwap,
        Self::HeadPairRegroup,
        Self::HeadCycleRegroup,
        Self::FinalPairRegroup,
        Self::FinalCycleRegroup,
    ];

    pub const fn index(self) -> usize {
        self as usize
    }

    pub fn parse(value: &str) -> Result<Self, String> {
        Self::ALL
            .into_iter()
            .find(|kind| kind.label() == value)
            .ok_or_else(|| format!("unknown proposal kind {value:?}"))
    }

    pub const fn label(self) -> &'static str {
        match self {
            Self::ToneSlotSwap => "tone-slot-swap",
            Self::ToneKeyReplacement => "tone-key-replacement",
            Self::HeadKeySwap => "head-key-swap",
            Self::HeadKeyReplacement => "head-key-replacement",
            Self::FinalKeySwap => "final-key-swap",
            Self::FinalKeyReplacement => "final-key-replacement",
            Self::HeadGroupMove => "head-group-move",
            Self::HeadGroupSwap => "head-group-swap",
            Self::FinalTokenMove => "final-token-move",
            Self::FinalTokenSwap => "final-token-swap",
            Self::HeadPairRegroup => "head-pair-regroup",
            Self::HeadCycleRegroup => "head-cycle-regroup",
            Self::FinalPairRegroup => "final-pair-regroup",
            Self::FinalCycleRegroup => "final-cycle-regroup",
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposalStats {
    pub proposed: usize,
    pub structural_rejected: usize,
    pub uniqueness_rejected: usize,
    pub guard_rejected: usize,
    pub evaluated: usize,
    pub accepted: usize,
}

pub fn validate_checkpoint_contract(
    version: &str,
    proposal_policy: &str,
    proposal_order: &[ProposalKind],
) -> Result<(), String> {
    if version != NATIVE_ANNEAL_CHECKPOINT_VERSION {
        return Err(format!(
            "checkpoint version mismatch: expected {NATIVE_ANNEAL_CHECKPOINT_VERSION}, got {version}"
        ));
    }
    if proposal_policy != NATIVE_PROPOSAL_POLICY {
        return Err(format!(
            "checkpoint proposal policy mismatch: expected {NATIVE_PROPOSAL_POLICY}, got {proposal_policy}"
        ));
    }
    if proposal_order != ProposalKind::ALL {
        return Err("checkpoint proposal order mismatch".to_owned());
    }
    Ok(())
}

#[derive(Clone, Copy, Debug)]
pub struct SearchRng {
    state: u64,
}

impl SearchRng {
    pub const fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    pub const fn state(&self) -> u64 {
        self.state
    }

    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut value = self.state;
        value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        value ^ (value >> 31)
    }

    pub fn index(&mut self, limit: usize) -> usize {
        assert!(limit > 0, "random index limit must be positive");
        (self.next_u64() % limit as u64) as usize
    }

    pub fn unit(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / ((1_u64 << 53) as f64))
    }
}

#[derive(Clone, Copy, Debug)]
pub struct ProposalContext<'a> {
    pub pinyin_map: &'a [[u8; 2]],
    pub common_pinyin: &'a [u16],
    pub only_kind: Option<ProposalKind>,
    pub max_attempts: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalError {
    MutationRejected(String),
    StructuralRejected(String),
    UniquenessRejected(String),
    AttemptsExhausted {
        attempts: usize,
        structural_rejected: usize,
        uniqueness_rejected: usize,
    },
}

impl fmt::Display for ProposalError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MutationRejected(detail) => write!(formatter, "mutation rejected: {detail}"),
            Self::StructuralRejected(detail) => write!(formatter, "structure rejected: {detail}"),
            Self::UniquenessRejected(detail) => write!(formatter, "Common399 rejected: {detail}"),
            Self::AttemptsExhausted {
                attempts,
                structural_rejected,
                uniqueness_rejected,
            } => write!(
                formatter,
                "could not generate a legal proposal in {attempts} attempts (structure={structural_rejected}, Common399={uniqueness_rejected})"
            ),
        }
    }
}

impl std::error::Error for ProposalError {}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalResult {
    pub layout: RegularLayout,
    pub kind: ProposalKind,
    pub structural_rejected: usize,
    pub uniqueness_rejected: usize,
}

pub fn propose(
    layout: &RegularLayout,
    kind: ProposalKind,
    rng: &mut SearchRng,
) -> Result<RegularLayout, ProposalError> {
    let mut candidate = layout.clone();
    mutate(&mut candidate, kind, rng).map_err(ProposalError::MutationRejected)?;
    if candidate == *layout {
        return Err(ProposalError::MutationRejected(
            "proposal is a no-op".to_owned(),
        ));
    }
    Ok(candidate)
}

pub fn validate_proposal(
    current: &RegularLayout,
    candidate: &RegularLayout,
    context: &ProposalContext<'_>,
) -> Result<(), ProposalError> {
    if candidate == current {
        return Err(ProposalError::StructuralRejected(
            "proposal is a no-op".to_owned(),
        ));
    }
    if candidate.capacity != current.capacity {
        return Err(ProposalError::StructuralRejected(
            "proposal changed the declared capacity".to_owned(),
        ));
    }
    candidate
        .validate_structure()
        .map_err(ProposalError::StructuralRejected)?;
    if candidate.capacity == [21, 21] {
        candidate
            .validate_strict_2121()
            .map_err(ProposalError::StructuralRejected)?;
    }
    candidate
        .validate_common399(context.pinyin_map, context.common_pinyin)
        .map_err(ProposalError::UniquenessRejected)
}

pub fn propose_valid(
    current: &RegularLayout,
    context: &ProposalContext<'_>,
    rng: &mut SearchRng,
) -> Result<ProposalResult, ProposalError> {
    let attempts = context.max_attempts.max(1);
    let mut structural_rejected = 0;
    let mut uniqueness_rejected = 0;
    for _ in 0..attempts {
        let kind = context
            .only_kind
            .unwrap_or_else(|| {
                if current.capacity == [21, 21] {
                    ProposalKind::STRICT_2121_KINDS[rng.index(ProposalKind::STRICT_2121_KINDS.len())]
                } else {
                    ProposalKind::ALL[rng.index(PROPOSAL_KIND_COUNT)]
                }
            });
        let candidate = match propose(current, kind, rng) {
            Ok(candidate) => candidate,
            Err(ProposalError::MutationRejected(_)) => {
                structural_rejected += 1;
                continue;
            }
            Err(error) => return Err(error),
        };
        match validate_proposal(current, &candidate, context) {
            Ok(()) => {
                return Ok(ProposalResult {
                    layout: candidate,
                    kind,
                    structural_rejected,
                    uniqueness_rejected,
                });
            }
            Err(ProposalError::StructuralRejected(_)) => structural_rejected += 1,
            Err(ProposalError::UniquenessRejected(_)) => uniqueness_rejected += 1,
            Err(error) => return Err(error),
        }
    }
    Err(ProposalError::AttemptsExhausted {
        attempts,
        structural_rejected,
        uniqueness_rejected,
    })
}

fn mutate(
    layout: &mut RegularLayout,
    kind: ProposalKind,
    rng: &mut SearchRng,
) -> Result<(), String> {
    match kind {
        ProposalKind::ToneSlotSwap => {
            let (left, right) = distinct_pair(5, rng)?;
            layout.swap_tone_slots(left, right)
        }
        ProposalKind::ToneKeyReplacement => {
            if layout.capacity == [21, 21] {
                return Err("tone-key-replacement is disabled for strict 21x21 AVUIO layouts".to_owned());
            }
            let candidates: Vec<_> = (0_u8..34)
                .filter(|key| {
                    !layout.tone.contains(key)
                        && !layout.head_keys.contains(key)
                        && (layout.capacity != [21, 21] || !layout.final_keys.contains(key))
                })
                .collect();
            if candidates.is_empty() {
                return Err("no unused auxiliary key is available".to_owned());
            }
            layout.replace_tone_key(rng.index(5), candidates[rng.index(candidates.len())])
        }
        ProposalKind::HeadKeySwap => {
            let keys = layout.distinct_head_keys();
            let (left, right) = distinct_pair(keys.len(), rng)?;
            layout.swap_head_keys(keys[left], keys[right])
        }
        ProposalKind::HeadKeyReplacement => {
            if layout.capacity == [21, 21] {
                return Err("head-key-replacement is disabled for strict 21x21 layouts (all 21 consonants active)".to_owned());
            }
            let keys = layout.distinct_head_keys();
            let candidates: Vec<_> = (0_u8..34)
                .filter(|key| !keys.contains(key) && !layout.tone.contains(key))
                .collect();
            if candidates.is_empty() {
                return Err("no unused head key is available".to_owned());
            }
            layout.swap_head_keys(
                keys[rng.index(keys.len())],
                candidates[rng.index(candidates.len())],
            )
        }
        ProposalKind::FinalKeySwap => {
            let keys = layout.distinct_final_keys();
            let (left, right) = distinct_pair(keys.len(), rng)?;
            layout.swap_final_keys(keys[left], keys[right])
        }
        ProposalKind::FinalKeyReplacement => {
            if layout.capacity == [21, 21] {
                return Err("final-key-replacement is disabled for strict 21x21 layouts (all 21 consonants active)".to_owned());
            }
            let keys = layout.distinct_final_keys();
            let candidates: Vec<_> = (0_u8..34)
                .filter(|key| {
                    !keys.contains(key)
                        && (layout.capacity != [21, 21] || !layout.tone.contains(key))
                })
                .collect();
            if candidates.is_empty() {
                return Err("no unused final key is available".to_owned());
            }
            layout.swap_final_keys(
                keys[rng.index(keys.len())],
                candidates[rng.index(candidates.len())],
            )
        }
        ProposalKind::HeadGroupMove => {
            let groups = head_groups(layout);
            let group = &groups[rng.index(groups.len())];
            let current_key = layout.head_keys[group[0]];
            let keys: Vec<_> = layout
                .distinct_head_keys()
                .into_iter()
                .filter(|&key| key != current_key)
                .collect();
            layout.assign_head_tokens(group, keys[rng.index(keys.len())])
        }
        ProposalKind::HeadGroupSwap => {
            let groups = head_groups(layout);
            let (left, right) = group_pair_on_distinct_keys(&groups, &layout.head_keys, rng)?;
            layout.swap_head_token_groups(&groups[left], &groups[right])
        }
        ProposalKind::FinalTokenMove => {
            let counts = key_counts(&layout.final_keys);
            let tokens: Vec<_> = (0..layout.final_keys.len())
                .filter(|&index| counts[usize::from(layout.final_keys[index])] > 1)
                .collect();
            if tokens.is_empty() {
                return Err("no movable final token is available".to_owned());
            }
            let token = tokens[rng.index(tokens.len())];
            let current_key = layout.final_keys[token];
            let keys: Vec<_> = layout
                .distinct_final_keys()
                .into_iter()
                .filter(|&key| key != current_key)
                .collect();
            layout.assign_final_token(token, keys[rng.index(keys.len())])
        }
        ProposalKind::FinalTokenSwap => {
            let groups: Vec<_> = (0..layout.final_keys.len())
                .map(|index| vec![index])
                .collect();
            let (left, right) = group_pair_on_distinct_keys(&groups, &layout.final_keys, rng)?;
            layout.swap_final_tokens(groups[left][0], groups[right][0])
        }
        ProposalKind::HeadPairRegroup => {
            let groups = head_groups(layout);
            regroup(&mut layout.head_keys, &groups, 2, rng)
        }
        ProposalKind::HeadCycleRegroup => {
            let groups = head_groups(layout);
            regroup(&mut layout.head_keys, &groups, 3, rng)
        }
        ProposalKind::FinalPairRegroup => {
            let groups: Vec<_> = (0..layout.final_keys.len())
                .map(|index| vec![index])
                .collect();
            regroup(&mut layout.final_keys, &groups, 2, rng)
        }
        ProposalKind::FinalCycleRegroup => {
            let groups: Vec<_> = (0..layout.final_keys.len())
                .map(|index| vec![index])
                .collect();
            regroup(&mut layout.final_keys, &groups, 3, rng)
        }
    }
}

fn regroup(
    values: &mut [u8],
    groups: &[Vec<usize>],
    arity: usize,
    rng: &mut SearchRng,
) -> Result<(), String> {
    let mut keys = values.to_vec();
    keys.sort_unstable();
    keys.dedup();
    if keys.len() < arity || arity < 2 {
        return Err(format!("regroup needs {arity} occupied keys"));
    }
    let mut selected_keys = Vec::with_capacity(arity);
    while selected_keys.len() < arity {
        let key = keys[rng.index(keys.len())];
        if !selected_keys.contains(&key) {
            selected_keys.push(key);
        }
    }
    let mut selections = Vec::with_capacity(arity);
    for &key in &selected_keys {
        let available: Vec<_> = groups
            .iter()
            .enumerate()
            .filter_map(|(index, group)| (values[group[0]] == key).then_some(index))
            .collect();
        if available.is_empty() {
            return Err("regroup selected an empty source".to_owned());
        }
        let mut chosen: Vec<_> = available
            .iter()
            .copied()
            .filter(|_| rng.next_u64() & 1 == 1)
            .collect();
        if chosen.is_empty() {
            chosen.push(available[rng.index(available.len())]);
        }
        selections.push(chosen);
    }
    for source in 0..arity {
        let target_key = selected_keys[(source + 1) % arity];
        for &group_index in &selections[source] {
            for &token in &groups[group_index] {
                values[token] = target_key;
            }
        }
    }
    Ok(())
}

fn group_pair_on_distinct_keys(
    groups: &[Vec<usize>],
    values: &[u8],
    rng: &mut SearchRng,
) -> Result<(usize, usize), String> {
    let eligible: Vec<_> = (0..groups.len())
        .filter(|&index| {
            groups
                .iter()
                .any(|other| values[other[0]] != values[groups[index][0]])
        })
        .collect();
    if eligible.is_empty() {
        return Err("no token groups on distinct keys".to_owned());
    }
    let left = eligible[rng.index(eligible.len())];
    let right_candidates: Vec<_> = (0..groups.len())
        .filter(|&index| values[groups[index][0]] != values[groups[left][0]])
        .collect();
    let right = right_candidates[rng.index(right_candidates.len())];
    Ok((left, right))
}

fn distinct_pair(limit: usize, rng: &mut SearchRng) -> Result<(usize, usize), String> {
    if limit < 2 {
        return Err("proposal needs at least two choices".to_owned());
    }
    let left = rng.index(limit);
    let mut right = rng.index(limit - 1);
    if right >= left {
        right += 1;
    }
    Ok((left, right))
}

fn key_counts(values: &[u8]) -> [usize; 34] {
    let mut counts = [0; 34];
    for &value in values {
        counts[usize::from(value)] += 1;
    }
    counts
}

fn head_groups(layout: &RegularLayout) -> Vec<Vec<usize>> {
    let mut groups: Vec<Vec<usize>> = (0..21).map(|index| vec![index]).collect();
    for index in 21..27 {
        if let Some(group) = groups
            .iter_mut()
            .skip(21)
            .find(|group| layout.head_keys[group[0]] == layout.head_keys[index])
        {
            group.push(index);
        } else {
            groups.push(vec![index]);
        }
    }
    groups
}
