use ckt_v4_core::{
    CapabilityReason, Common399Policy, KeyAlphabet, SchemeCapability, SchemeFixture, SchemeInput,
    audit_scheme,
};
use std::collections::HashMap;

const ALPHABET: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ[]\\;',./";

fn key(index: usize) -> char {
    ALPHABET.chars().nth(index).unwrap()
}

fn fixture(capacity: [u8; 2], extension_mismatch: bool) -> (SchemeFixture, SchemeInput) {
    let head_keys: Vec<_> = (0..27)
        .map(|index| index % usize::from(capacity[0]))
        .collect();
    let final_keys: Vec<_> = (0..35)
        .map(|index| index % usize::from(capacity[1]))
        .collect();
    let mut pinyin_map = Vec::new();
    let mut code_list = Vec::new();
    for (final_index, &final_key) in final_keys.iter().enumerate() {
        let head = final_index % 27;
        pinyin_map.push([head as u8, final_index as u8]);
        code_list.push(Some(format!("{}{}", key(head_keys[head]), key(final_key))));
    }
    pinyin_map.push([0, 0]);
    code_list.push(Some(if extension_mismatch {
        format!("{}{}", key(head_keys[0]), key((final_keys[0] + 1) % 34))
    } else {
        format!("{}{}", key(head_keys[0]), key(final_keys[0]))
    }));
    let common_pinyin = (0..35).map(|index| index as u16).collect();
    let tone_start = usize::from(capacity[0]);
    let tone = (tone_start..tone_start + 5).map(key).collect();
    let input = SchemeInput {
        id: "synthetic".to_owned(),
        capacity,
        tone,
        code_list,
    };
    let fixture = SchemeFixture {
        version: "ckt-v4-scheme-state-2".to_owned(),
        key_alphabet: ALPHABET.to_owned(),
        source_hashes: HashMap::from([("html".to_owned(), "synthetic".to_owned())]),
        heads: (0..27).map(|index| format!("h{index}")).collect(),
        finals: (0..35).map(|index| format!("f{index}")).collect(),
        pinyin_map,
        common_pinyin,
        schemes: Vec::new(),
    };
    (fixture, input)
}

fn audit(capacity: [u8; 2], extension_mismatch: bool) -> SchemeCapability {
    let (fixture, input) = fixture(capacity, extension_mismatch);
    let alphabet = KeyAlphabet::new(ALPHABET).unwrap();
    audit_scheme(&fixture, &input, &alphabet)
}

#[test]
fn regular_scheme_is_forward_and_anneal_capable() {
    let result = audit([27, 34], false);
    assert!(result.forward_score);
    assert!(result.regular_anneal);
    assert!(result.common_round_trip);
    assert!(result.extension_round_trip);
    assert_eq!(result.reason_code, CapabilityReason::Supported);
    assert_eq!(result.common399_policy, Common399Policy::RequireUnique);
}

#[test]
fn context_split_final_is_forward_valid_but_not_regular() {
    let (mut fixture, mut input) = fixture([27, 34], false);
    fixture.common_pinyin.push(35);
    input.code_list[35] = Some(format!("{}{}", key(1), key(1)));
    fixture.pinyin_map[35] = [1, 0];
    let alphabet = KeyAlphabet::new(ALPHABET).unwrap();
    let result = audit_scheme(&fixture, &input, &alphabet);
    assert!(result.forward_score);
    assert!(!result.regular_anneal);
    assert_eq!(result.reason_code, CapabilityReason::CommonFinalSplit);
}

#[test]
fn invalid_forward_key_has_stable_reason() {
    let (fixture, mut input) = fixture([27, 34], false);
    input.code_list[0] = Some("A?".to_owned());
    let alphabet = KeyAlphabet::new(ALPHABET).unwrap();
    let result = audit_scheme(&fixture, &input, &alphabet);
    assert!(!result.forward_score);
    assert!(!result.regular_anneal);
    assert_eq!(result.reason_code, CapabilityReason::ForwardInvalid);
}

#[test]
fn extension_only_difference_does_not_disable_regular_annealing() {
    let result = audit([27, 34], true);
    assert!(result.forward_score);
    assert!(result.regular_anneal);
    assert!(result.common_round_trip);
    assert!(!result.extension_round_trip);
    assert_eq!(result.reason_code, CapabilityReason::Supported);
}

#[test]
fn regular_23x23_keeps_the_dimension_based_collision_policy() {
    let result = audit([23, 23], false);
    assert!(result.regular_anneal);
    assert_eq!(result.common399_policy, Common399Policy::AllowCollisions);
}
