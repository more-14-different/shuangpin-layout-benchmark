use approx::assert_abs_diff_eq;
use ckt_v4_core::{
    ErgonomicFixture, KeyAlphabet, MovingHandCorpus, MovingHandToken, SchemeFixture, SchemeInput,
    SchemeState,
};
use std::path::{Path, PathBuf};

fn repo_path(relative: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join(relative)
}

fn fixture() -> ErgonomicFixture {
    ErgonomicFixture::open(repo_path("research/.cache/ckt-v4-ergonomics.json"))
        .expect("run `just ckt-v4-ergonomic-fixture` first")
}

fn minimal_scheme() -> SchemeState {
    let alphabet = KeyAlphabet::new("ABCDEFGHIJKLMNOPQRSTUVWXYZ[]\\;',./").unwrap();
    SchemeState::compile(
        &SchemeInput {
            id: "minimal".into(),
            capacity: [27, 34],
            tone: "ABCDE".into(),
            code_list: vec![Some("AA".into())],
        },
        &alphabet,
        1,
    )
    .unwrap()
}

fn fixed(key: &str) -> MovingHandToken {
    MovingHandToken {
        character: key.into(),
        pinyin: None,
        pinyin_index: None,
        key: Some(key.into()),
    }
}

#[test]
fn two_key_path_matches_the_documented_initial_column_convention() {
    let fixture = fixture();
    let corpus = MovingHandCorpus::from_tokens(vec![fixed("Q"), fixed("W")]);
    let actual = fixture
        .moving_hand
        .evaluate(&minimal_scheme(), &corpus)
        .unwrap();
    let first_distance = 0.2 + (1.0_f64 + 0.25_f64.powi(2)).sqrt();
    let expected_time = first_distance / 0.6 + 0.2 / 0.9;
    assert_abs_diff_eq!(actual.time, expected_time, epsilon = 1e-14);
    assert_eq!(actual.hits, 2);
    assert_eq!(actual.chars, 2);
    assert_eq!(actual.row_load, [2, 0, 0]);
}

#[test]
fn fixed_key_precedes_pinyin_mapping_and_extensions_keep_mx34_geometry() {
    let fixture = fixture();
    let mut precedence = fixed("Q");
    precedence.pinyin = Some("not-used".into());
    precedence.pinyin_index = Some(usize::MAX);
    let summary = fixture
        .moving_hand
        .evaluate(
            &minimal_scheme(),
            &MovingHandCorpus::from_tokens(vec![precedence]),
        )
        .unwrap();
    assert_eq!(summary.hits, 1);

    let expected = [
        ('[', 10.0, 0),
        (']', 11.0, 0),
        ('\\', 12.25, 0),
        ('\'', 10.0, 1),
    ];
    for (key, x, y) in expected {
        let geometry = &fixture.moving_hand.geometry[&key.to_string()];
        assert_eq!(geometry.x, x);
        assert_eq!(geometry.y, y);
        assert_eq!(geometry.finger, 9);
    }
    let corpus =
        MovingHandCorpus::from_tokens(["[", "]", "\\", "'"].into_iter().map(fixed).collect());
    let summary = fixture
        .moving_hand
        .evaluate(&minimal_scheme(), &corpus)
        .unwrap();
    assert_eq!(summary.extended_key_hits, 4);
}

#[test]
fn empty_and_unknown_key_inputs_fail_explicitly() {
    let fixture = fixture();
    assert!(
        fixture
            .moving_hand
            .evaluate(&minimal_scheme(), &MovingHandCorpus::from_tokens(vec![]))
            .unwrap_err()
            .contains("empty")
    );
    assert!(
        fixture
            .moving_hand
            .evaluate(
                &minimal_scheme(),
                &MovingHandCorpus::from_tokens(vec![fixed("?")]),
            )
            .unwrap_err()
            .contains("unknown key")
    );
}

#[test]
fn reproduces_frozen_r11_summaries_for_two_schemes_and_four_corpora() {
    let fixture = fixture();
    let schemes = SchemeFixture::open(repo_path("research/.cache/ckt-v4-all-schemes.json"))
        .expect("run `just ckt-v4-all-scheme-fixture` first");
    let alphabet = KeyAlphabet::new(&schemes.key_alphabet).unwrap();
    for id in ["S005-NF", "SNF4-M36-AE-07"] {
        let input = schemes
            .schemes
            .iter()
            .find(|scheme| scheme.id == id)
            .unwrap();
        let scheme = SchemeState::compile(input, &alphabet, schemes.pinyin_map.len()).unwrap();
        for corpus_name in ["daily", "default"] {
            for variant in ["native-punctuation", "hanzi-only"] {
                let corpus = fixture.moving_hand.corpus(corpus_name, variant).unwrap();
                let actual = fixture.moving_hand.evaluate(&scheme, &corpus).unwrap();
                let expected =
                    &fixture.expected[id].moving_hand[&format!("{corpus_name}|{variant}")];
                assert_abs_diff_eq!(actual.time, expected.time, epsilon = 1e-10);
                assert_abs_diff_eq!(actual.score, expected.score, epsilon = 1e-10);
                assert_abs_diff_eq!(
                    actual.total_distance,
                    expected.total_distance,
                    epsilon = 1e-10
                );
                assert_abs_diff_eq!(
                    actual.same_hand_rate,
                    expected.same_hand_rate,
                    epsilon = 1e-10
                );
                assert_eq!(actual.row_load, expected.row_load);
                assert_eq!(actual.finger_load, expected.finger_load);
                assert_eq!(actual.left_load, expected.left_load);
                assert_eq!(actual.right_load, expected.right_load);
                assert_eq!(actual.same_finger_hits, expected.same_finger_hits);
                assert_eq!(actual.unit, "relative hand-model cost; not ms");
            }
        }
    }
}
