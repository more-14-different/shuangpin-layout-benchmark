use ckt_v4_core::{
    ErgonomicFrontierMetrics, ErgonomicGuards, ErgonomicMetricSchema, ExactFrontier,
    FrontierMetrics, FrontierPoint, LoadDiagnostics, MetricDirection, MetricVerification,
    RegularLayout,
};

fn layout(id: &str, marker: u8) -> RegularLayout {
    let mut head_keys: Vec<_> = (0..27).map(|index| (index % 21) as u8).collect();
    head_keys.swap(0, usize::from(marker % 20) + 1);
    RegularLayout {
        id: id.into(),
        capacity: [21, 21],
        head_keys,
        final_keys: (0..35).map(|index| (index % 21) as u8).collect(),
        tone: [21, 22, 23, 24, 25],
    }
}

fn loads(peak: f64) -> LoadDiagnostics {
    LoadDiagnostics {
        rp_s2: peak / 2.0,
        rp_max: peak,
        home_s2: 0.4,
        home_c4: 0.3,
        home_wx: 0.35,
        home_floor: 0.3,
        w_max: peak + 0.01,
        y_max: peak + 0.02,
    }
}

fn point(id: &str, marker: u8, ckt: f64, peak: f64, mx: f64) -> FrontierPoint {
    FrontierPoint {
        metrics: FrontierMetrics {
            ckt_v4: ckt,
            memory: 40,
            displaced_initials: 3,
            displaced_vowels: 1,
            ergonomics: Some(ErgonomicFrontierMetrics {
                loads: loads(peak),
                mx_score: Some(mx),
            }),
        },
        layout: layout(id, marker),
        iteration: marker.into(),
    }
}

#[test]
fn no_ergonomic_schema_preserves_the_ckt_only_frontier() {
    let candidates = [
        point("a", 1, 10.0, 0.9, 80.0),
        point("b", 2, 9.0, 9.0, 10.0),
    ];
    let mut baseline = ExactFrontier::new();
    let mut explicit_none = ExactFrontier::with_schema(ErgonomicMetricSchema::default());
    for candidate in candidates {
        baseline.insert(candidate.clone()).unwrap();
        explicit_none.insert(candidate).unwrap();
    }
    assert_eq!(baseline.members(), explicit_none.members());
    assert_eq!(baseline.members().len(), 1);
    assert_eq!(baseline.members()[0].layout.id, "b");
}

#[test]
fn exact_loads_minimize_and_exact_mx_maximizes() {
    let schema = ErgonomicMetricSchema {
        loads: Some(MetricVerification::Exact),
        moving_hand: Some(MetricVerification::Exact),
    };
    let mut frontier = ExactFrontier::with_schema(schema);
    let declarations = schema.declarations();
    assert_eq!(
        declarations
            .iter()
            .find(|metric| metric.name == "rightPinkyPeak")
            .unwrap()
            .direction,
        MetricDirection::Minimize
    );
    assert_eq!(
        declarations
            .iter()
            .find(|metric| metric.name == "movingHandScore")
            .unwrap()
            .direction,
        MetricDirection::Maximize
    );
    frontier
        .insert(point("worse", 1, 10.0, 0.4, 100.0))
        .unwrap();
    frontier
        .insert(point("better", 2, 10.0, 0.3, 110.0))
        .unwrap();
    assert_eq!(frontier.members().len(), 1);
    assert_eq!(frontier.members()[0].layout.id, "better");
}

#[test]
fn provisional_metrics_never_change_membership_or_enforce_guards() {
    let mut baseline = ExactFrontier::new();
    let mut provisional = ExactFrontier::with_schema(ErgonomicMetricSchema {
        loads: Some(MetricVerification::Provisional),
        moving_hand: Some(MetricVerification::Provisional),
    });
    for candidate in [
        point("a", 1, 10.0, 0.1, 200.0),
        point("b", 2, 9.0, 9.0, 1.0),
    ] {
        baseline.insert(candidate.clone()).unwrap();
        provisional.insert(candidate).unwrap();
    }
    assert_eq!(baseline.members(), provisional.members());

    let guards = ErgonomicGuards {
        max_rp_s2: Some(0.01),
        max_rp: Some(0.01),
        max_w: Some(0.01),
        max_y: Some(0.01),
        min_mx_score: Some(999.0),
    };
    let metrics = ErgonomicFrontierMetrics {
        loads: loads(1.0),
        mx_score: Some(1.0),
    };
    assert!(
        guards
            .validate(MetricVerification::Provisional, &metrics)
            .is_ok()
    );
    assert!(
        guards
            .validate(MetricVerification::Exact, &metrics)
            .unwrap_err()
            .contains("right-pinky")
    );
}
