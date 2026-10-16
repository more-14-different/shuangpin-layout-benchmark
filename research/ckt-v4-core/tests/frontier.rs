use ckt_v4_core::{ExactFrontier, FrontierMetrics, FrontierPoint, RegularLayout};

fn layout(id: &str, marker: u8) -> RegularLayout {
    let mut head_keys: Vec<_> = (0..27).map(|index| (index % 21) as u8).collect();
    head_keys.swap(0, usize::from(marker % 20) + 1);
    RegularLayout {
        id: id.to_owned(),
        capacity: [21, 21],
        head_keys,
        final_keys: (0..35).map(|index| (index % 21) as u8).collect(),
        tone: [21, 22, 23, 24, 25],
    }
}

fn point(id: &str, marker: u8, values: (f64, usize, usize, usize)) -> FrontierPoint {
    FrontierPoint {
        metrics: FrontierMetrics {
            ckt_v4: values.0,
            memory: values.1,
            displaced_initials: values.2,
            displaced_vowels: values.3,
            ergonomics: None,
        },
        layout: layout(id, marker),
        iteration: usize::from(marker),
    }
}

#[test]
fn rejects_dominated_points_and_removes_newly_dominated_members() {
    let mut frontier = ExactFrontier::new();
    assert!(frontier.insert(point("a", 1, (10.0, 40, 4, 2))).unwrap());
    assert!(
        !frontier
            .insert(point("worse", 2, (11.0, 40, 5, 2)))
            .unwrap()
    );
    assert!(
        frontier
            .insert(point("tradeoff", 3, (9.0, 44, 4, 2)))
            .unwrap()
    );
    assert_eq!(frontier.members().len(), 2);
    assert!(frontier.insert(point("best", 4, (8.0, 39, 3, 1))).unwrap());
    assert_eq!(frontier.members().len(), 1);
    assert_eq!(frontier.members()[0].layout.id, "best");
}

#[test]
fn exact_metric_ties_use_canonical_layout_bytes() {
    let left = point("z-id", 1, (10.0, 40, 4, 2));
    let right = point("a-id", 1, (10.0, 40, 4, 2));
    let mut forward = ExactFrontier::new();
    forward.insert(left.clone()).unwrap();
    forward.insert(right.clone()).unwrap();
    let mut reverse = ExactFrontier::new();
    reverse.insert(right).unwrap();
    reverse.insert(left).unwrap();
    assert_eq!(forward.members(), reverse.members());
    assert_eq!(forward.members()[0].layout.id, "a-id");
}

#[test]
fn duplicate_layout_is_replaced_by_its_better_record() {
    let mut frontier = ExactFrontier::new();
    frontier.insert(point("same", 5, (10.0, 40, 4, 2))).unwrap();
    let mut improved = point("same", 5, (9.5, 40, 4, 2));
    improved.iteration = 99;
    assert!(frontier.insert(improved).unwrap());
    assert_eq!(frontier.members().len(), 1);
    assert_eq!(frontier.members()[0].metrics.ckt_v4, 9.5);
    assert_eq!(frontier.members()[0].iteration, 99);
}

#[test]
fn non_finite_ckt_is_rejected() {
    let mut frontier = ExactFrontier::new();
    let error = frontier
        .insert(point("nan", 0, (f64::NAN, 1, 1, 1)))
        .unwrap_err();
    assert!(error.contains("finite"));
    assert!(frontier.members().is_empty());
}
