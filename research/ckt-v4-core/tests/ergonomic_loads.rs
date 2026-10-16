use approx::assert_abs_diff_eq;
use ckt_v4_core::{ErgonomicFixture, KeyAlphabet, RegularLayout};
use serde_json::Value;
use std::fs;
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

fn expected_layout(fixture: &ErgonomicFixture, id: &str) -> RegularLayout {
    let expected = &fixture.expected[id];
    let alphabet = KeyAlphabet::new(&fixture.load_model.layout_key_alphabet).unwrap();
    let keys: Vec<u8> = expected
        .layout
        .iter()
        .map(|key| alphabet.index_of(key.chars().next().unwrap()).unwrap())
        .collect();
    RegularLayout {
        id: id.to_owned(),
        capacity: [21, 26],
        head_keys: keys[..27].to_vec(),
        final_keys: keys[27..62].to_vec(),
        tone: keys[62..].try_into().unwrap(),
    }
}

#[test]
fn reproduces_frozen_r11_loads_for_regular_seeds() {
    let fixture = fixture();
    for id in ["S005-NF", "SNF4-M36-AE-07"] {
        let actual = fixture
            .load_model
            .diagnose(&expected_layout(&fixture, id))
            .unwrap();
        let expected = fixture.expected[id].loads;
        assert_abs_diff_eq!(actual.rp_s2, expected.rp_s2, epsilon = 1e-14);
        assert_abs_diff_eq!(actual.rp_max, expected.rp_max, epsilon = 1e-14);
        assert_abs_diff_eq!(actual.home_s2, expected.home_s2, epsilon = 1e-14);
        assert_abs_diff_eq!(actual.home_c4, expected.home_c4, epsilon = 1e-14);
        assert_abs_diff_eq!(actual.home_wx, expected.home_wx, epsilon = 1e-14);
        assert_abs_diff_eq!(actual.home_floor, expected.home_floor, epsilon = 1e-14);
        assert_abs_diff_eq!(actual.w_max, expected.w_max, epsilon = 1e-14);
        assert_abs_diff_eq!(actual.y_max, expected.y_max, epsilon = 1e-14);
    }
}

#[test]
fn rejects_permuted_token_and_key_vocabularies() {
    let source = repo_path("research/.cache/ckt-v4-ergonomics.json");
    let mut value: Value = serde_json::from_str(&fs::read_to_string(source).unwrap()).unwrap();
    value["tokenOrder"].as_array_mut().unwrap().swap(0, 1);
    let path = std::env::temp_dir().join(format!(
        "ckt-v4-ergonomic-invalid-{}.json",
        std::process::id()
    ));
    fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();
    let error = ErgonomicFixture::open(&path).unwrap_err();
    fs::remove_file(path).unwrap();
    assert!(error.contains("token order"), "{error}");

    let mut value: Value = serde_json::from_str(
        &fs::read_to_string(repo_path("research/.cache/ckt-v4-ergonomics.json")).unwrap(),
    )
    .unwrap();
    value["loadModel"]["keys"] = Value::String("WQERTYUIOPASDFGHJKLZXCVBNM;/,.[]\\'".into());
    let path = std::env::temp_dir().join(format!(
        "ckt-v4-ergonomic-key-invalid-{}.json",
        std::process::id()
    ));
    fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();
    let error = ErgonomicFixture::open(&path).unwrap_err();
    fs::remove_file(path).unwrap();
    assert!(error.contains("load key order"), "{error}");
}
