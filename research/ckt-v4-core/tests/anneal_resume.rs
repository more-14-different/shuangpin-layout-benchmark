use ckt_v4_core::{
    NATIVE_ANNEAL_CHECKPOINT_VERSION, NATIVE_PROPOSAL_POLICY, PROPOSAL_KIND_COUNT, ProposalContext,
    ProposalError, ProposalKind, ProposalStats, RegularLayout, SearchRng, propose,
    validate_checkpoint_contract, validate_proposal,
};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    version: String,
    proposal_policy: String,
    proposal_order: [ProposalKind; PROPOSAL_KIND_COUNT],
    rng_state: u64,
    iteration: usize,
    layout: RegularLayout,
    stats: [ProposalStats; PROPOSAL_KIND_COUNT],
}

fn seed() -> RegularLayout {
    RegularLayout {
        id: "resume-seed".to_owned(),
        capacity: [21, 21],
        head_keys: (0..27).map(|index| (index % 21) as u8).collect(),
        final_keys: (0..35).map(|index| (index % 21) as u8).collect(),
        tone: [21, 22, 23, 24, 25],
    }
}

fn initial() -> Snapshot {
    Snapshot {
        version: NATIVE_ANNEAL_CHECKPOINT_VERSION.to_owned(),
        proposal_policy: NATIVE_PROPOSAL_POLICY.to_owned(),
        proposal_order: ProposalKind::ALL,
        rng_state: 0x1234_5678,
        iteration: 0,
        layout: seed(),
        stats: [ProposalStats::default(); PROPOSAL_KIND_COUNT],
    }
}

fn advance(mut state: Snapshot, steps: usize) -> Snapshot {
    let pinyin_map = vec![[0, 0], [1, 1], [2, 2]];
    let common_pinyin = vec![0, 1, 2];
    let context = ProposalContext {
        pinyin_map: &pinyin_map,
        common_pinyin: &common_pinyin,
        only_kind: None,
        max_attempts: 1,
    };
    let mut rng = SearchRng::new(state.rng_state);
    for _ in 0..steps {
        let kind = ProposalKind::ALL[rng.index(PROPOSAL_KIND_COUNT)];
        let stats = &mut state.stats[kind.index()];
        stats.proposed += 1;
        let candidate = match propose(&state.layout, kind, &mut rng) {
            Ok(candidate) => candidate,
            Err(ProposalError::MutationRejected(_)) => {
                stats.structural_rejected += 1;
                state.iteration += 1;
                continue;
            }
            Err(error) => panic!("unexpected proposal error: {error}"),
        };
        match validate_proposal(&state.layout, &candidate, &context) {
            Ok(()) => {
                stats.evaluated += 1;
                stats.accepted += 1;
                state.layout = candidate;
            }
            Err(ProposalError::StructuralRejected(_)) => stats.structural_rejected += 1,
            Err(ProposalError::UniquenessRejected(_)) => stats.uniqueness_rejected += 1,
            Err(error) => panic!("unexpected validation error: {error}"),
        }
        state.iteration += 1;
    }
    state.rng_state = rng.state();
    state
}

#[test]
fn interrupted_resume_matches_the_continuous_chain_bit_for_bit() {
    let continuous = advance(initial(), 40);
    let first_half = advance(initial(), 17);
    let bytes = serde_json::to_vec(&first_half).unwrap();
    let resumed: Snapshot = serde_json::from_slice(&bytes).unwrap();
    validate_checkpoint_contract(
        &resumed.version,
        &resumed.proposal_policy,
        &resumed.proposal_order,
    )
    .unwrap();
    let resumed = advance(resumed, 23);
    assert_eq!(
        serde_json::to_vec(&continuous).unwrap(),
        serde_json::to_vec(&resumed).unwrap()
    );
}

#[test]
fn version_eight_checkpoint_is_rejected_explicitly() {
    let error = validate_checkpoint_contract(
        "ckt-v4-native-anneal-8",
        NATIVE_PROPOSAL_POLICY,
        &ProposalKind::ALL,
    )
    .unwrap_err();
    assert!(error.contains("checkpoint version mismatch"));
}
