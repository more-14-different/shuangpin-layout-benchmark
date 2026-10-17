use ckt_v4_core::{
    ErgonomicFrontierMetrics, ErgonomicMetricSchema, ExplorationBatch, ExplorationConfig,
    FrontierLogProvenance, FrontierMetrics, FrontierPoint, LoadDiagnostics, MetricVerification,
    RegularLayout, layout_distance, layout_state_key, update_and_plan,
};

fn layout(id: &str, changes: &[(usize, u8)]) -> RegularLayout {
    let mut values: Vec<_> = (0..27)
        .map(|index| (index % 21) as u8)
        .chain((0..35).map(|index| (index % 21) as u8))
        .chain(21..26)
        .collect();
    for &(index, value) in changes {
        values[index] = value;
    }
    RegularLayout {
        id: id.to_owned(),
        capacity: [21, 21],
        head_keys: values[..27].to_vec(),
        final_keys: values[27..62].to_vec(),
        tone: values[62..].try_into().unwrap(),
    }
}

fn point(id: &str, changes: &[(usize, u8)], ckt: f64, rp: f64, home: f64) -> FrontierPoint {
    FrontierPoint {
        metrics: FrontierMetrics {
            ckt_v4: ckt,
            memory: 40,
            displaced_initials: 2,
            displaced_vowels: 1,
            ergonomics: Some(ErgonomicFrontierMetrics {
                loads: LoadDiagnostics {
                    rp_s2: rp,
                    rp_max: rp,
                    home_s2: home,
                    home_c4: home,
                    home_wx: home,
                    home_floor: home,
                    w_max: 0.08,
                    y_max: 0.07,
                },
                mx_score: Some(140.0),
            }),
        },
        layout: layout(id, changes),
        iteration: 1,
    }
}

fn provenance() -> FrontierLogProvenance {
    FrontierLogProvenance {
        corpus_hash: "corpus".to_owned(),
        scheme_hash: "scheme".to_owned(),
        scheme_id: "seed".to_owned(),
        max_memory: None,
        max_displaced_initials: None,
        max_displaced_vowels: None,
        proposal_policy: "regular-compound-v1".to_owned(),
        ergonomic_schema: ErgonomicMetricSchema {
            loads: Some(MetricVerification::Exact),
            moving_hand: Some(MetricVerification::Exact),
        },
        ergonomic_contract: Some("exact".to_owned()),
    }
}

#[test]
fn state_identity_ignores_display_id_and_distance_counts_changed_tokens() {
    let first = layout("first", &[]);
    let second = layout("renamed", &[]);
    let third = layout("changed", &[(0, 20), (30, 19)]);
    assert_eq!(layout_state_key(&first), layout_state_key(&second));
    assert_ne!(layout_state_key(&first), layout_state_key(&third));
    assert_eq!(layout_distance(&first, &third).unwrap(), 2);
}

#[test]
fn generations_deduplicate_states_and_emit_diverse_seeds_and_review_flags() {
    let initial = ExplorationBatch {
        source: "g1.jsonl".to_owned(),
        provenance: provenance(),
        points: vec![
            point("base", &[], 10.0, 0.04, 0.22),
            point("base-alias", &[], 10.0, 0.04, 0.22),
        ],
    };
    let config = ExplorationConfig {
        seed_count: 3,
        max_ckt_delta: 0.5,
        novelty_distance: 3,
        basin_radius: 2,
        basin_support: 2,
    };
    let (archive, first_plan) = update_and_plan(None, vec![initial], 1, config).unwrap();
    assert_eq!(archive.entries.len(), 1);
    assert_eq!(archive.entries[0].evaluations, 2);
    assert_eq!(first_plan.seeds.len(), 1);
    assert!(first_plan.review_queue.is_empty());

    let next = ExplorationBatch {
        source: "g2.jsonl".to_owned(),
        provenance: provenance(),
        points: vec![
            point("new-a", &[(0, 20), (1, 19), (2, 18)], 9.9, 0.03, 0.24),
            point(
                "new-b",
                &[(0, 20), (1, 19), (2, 18), (3, 17)],
                9.92,
                0.029,
                0.25,
            ),
            point("near-old", &[(0, 20)], 9.95, 0.035, 0.23),
        ],
    };
    let (archive, plan) = update_and_plan(Some(archive), vec![next], 2, config).unwrap();
    assert_eq!(archive.entries.len(), 4);
    assert_eq!(plan.imported_new_states, 3);
    assert_eq!(plan.seeds.len(), 3);
    assert!(
        plan.seeds
            .iter()
            .any(|seed| seed.reason == "best-new-ckt-v4")
    );
    assert!(plan.seeds.iter().all(|seed| seed.point.layout.id != "base"));
    assert!(
        plan.review_queue
            .iter()
            .any(|candidate| candidate.kind == "emerging-basin")
    );
    assert_eq!(plan.review_queue.len(), 1);
}

#[test]
fn archive_rejects_logs_from_a_different_search_contract() {
    let initial = ExplorationBatch {
        source: "g1.jsonl".to_owned(),
        provenance: provenance(),
        points: vec![point("base", &[], 10.0, 0.04, 0.22)],
    };
    let (archive, _) =
        update_and_plan(None, vec![initial], 1, ExplorationConfig::default()).unwrap();
    let mut changed = provenance();
    changed.max_memory = Some(40);
    let error = update_and_plan(
        Some(archive),
        vec![ExplorationBatch {
            source: "g2.jsonl".to_owned(),
            provenance: changed,
            points: vec![point("new", &[(0, 20)], 9.9, 0.03, 0.24)],
        }],
        2,
        ExplorationConfig::default(),
    )
    .unwrap_err();
    assert!(error.contains("search contract"));
}
