use ckt_v4_core::{
    ProposalContext, ProposalError, ProposalKind, RegularLayout, SearchRng, propose_valid,
    validate_proposal,
};
use std::collections::{BTreeMap, BTreeSet};

fn frozen_21x26() -> RegularLayout {
    RegularLayout {
        id: "SNF4-M36-AE-07".to_owned(),
        capacity: [21, 26],
        head_keys: vec![
            1, 15, 12, 23, 5, 19, 13, 11, 6, 10, 7, 9, 22, 23, 21, 16, 3, 17, 25, 2, 18, 9, 9, 9,
            22, 24, 24,
        ],
        final_keys: vec![
            0, 7, 11, 24, 18, 4, 16, 12, 13, 16, 8, 15, 10, 5, 25, 2, 6, 3, 9, 1, 14, 15, 22, 20,
            3, 6, 23, 10, 14, 17, 9, 21, 17, 19, 23,
        ],
        tone: [8, 4, 20, 0, 14],
    }
}

fn unique_common_topology(layout: &RegularLayout) -> (Vec<[u8; 2]>, Vec<u16>) {
    let mut seen = BTreeSet::new();
    let mut topology = Vec::new();
    for head in 0..layout.head_keys.len() {
        for final_index in 0..layout.final_keys.len() {
            let code = (layout.head_keys[head], layout.final_keys[final_index]);
            if seen.insert(code) {
                topology.push([head as u8, final_index as u8]);
                if topology.len() == 399 {
                    let common = (0..399).map(|index| index as u16).collect();
                    return (topology, common);
                }
            }
        }
    }
    panic!("the frozen seed does not expose 399 unique codes")
}

fn zero_initial_partition(layout: &RegularLayout) -> BTreeMap<u8, Vec<usize>> {
    let mut result = BTreeMap::<u8, Vec<usize>>::new();
    for index in 21..27 {
        result
            .entry(layout.head_keys[index])
            .or_default()
            .push(index);
    }
    result
}

#[test]
fn compound_proposals_preserve_capacity_auxiliary_keys_and_atomic_groups() {
    let seed = frozen_21x26();
    let (pinyin_map, common_pinyin) = unique_common_topology(&seed);
    let original_groups: Vec<_> = zero_initial_partition(&seed).into_values().collect();
    for (offset, kind) in [
        ProposalKind::HeadPairRegroup,
        ProposalKind::HeadCycleRegroup,
        ProposalKind::FinalPairRegroup,
        ProposalKind::FinalCycleRegroup,
    ]
    .into_iter()
    .enumerate()
    {
        let context = ProposalContext {
            pinyin_map: &pinyin_map,
            common_pinyin: &common_pinyin,
            only_kind: Some(kind),
            max_attempts: 4_096,
        };
        let mut rng = SearchRng::new(0x5eed_u64 + offset as u64);
        let result = propose_valid(&seed, &context, &mut rng).unwrap();
        assert_ne!(result.layout, seed, "{kind:?} returned a no-op");
        assert_eq!(result.layout.distinct_head_keys().len(), 21);
        assert_eq!(result.layout.distinct_final_keys().len(), 26);
        assert_eq!(
            result
                .layout
                .tone
                .iter()
                .copied()
                .collect::<BTreeSet<_>>()
                .len(),
            5
        );
        for group in &original_groups {
            assert!(
                group
                    .iter()
                    .all(|&index| result.layout.head_keys[index]
                        == result.layout.head_keys[group[0]]),
                "{kind:?} split a zero-initial atomic group"
            );
        }
        result.layout.validate(&pinyin_map, &common_pinyin).unwrap();
    }
}

#[test]
fn uniqueness_is_classified_before_any_scoring_work() {
    let seed = frozen_21x26();
    let pinyin_map = vec![[0, 0], [13, 0]];
    let common_pinyin = vec![0, 1];
    let context = ProposalContext {
        pinyin_map: &pinyin_map,
        common_pinyin: &common_pinyin,
        only_kind: None,
        max_attempts: 1,
    };
    let mut colliding = seed.clone();
    colliding.head_keys[0] = 23;
    colliding.head_keys[3] = 1;
    assert_eq!(colliding.distinct_head_keys().len(), 21);

    let error = validate_proposal(&seed, &colliding, &context).unwrap_err();
    assert!(matches!(error, ProposalError::UniquenessRejected(_)));
}
