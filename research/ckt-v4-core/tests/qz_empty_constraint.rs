use ckt_v4_core::toned_bucket::*;
use serde::Deserialize;
use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SeedsInventory {
    #[serde(default)]
    audit_token_keys: Vec<String>,
}

fn load_fixture_and_validator() -> (TrialFixture, BucketValidator) {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let fixture_path =
        manifest_dir.join("../.cache/ckt-v51-toned-2121-marsfirst-zh-e-mars10-rust.json");
    let fixture_str = fs::read_to_string(&fixture_path)
        .unwrap_or_else(|_| panic!("fixture file exists at {:?}", fixture_path));
    let fixture: TrialFixture = serde_json::from_str(&fixture_str).expect("valid fixture JSON");

    let seeds_path = manifest_dir.join("../config/ckt-v51-toned-2121-seeds.json");
    let seeds_str = fs::read_to_string(&seeds_path)
        .unwrap_or_else(|_| panic!("seeds file exists at {:?}", seeds_path));
    let seeds: SeedsInventory = serde_json::from_str(&seeds_str).expect("valid seeds JSON");
    let audit_tokens: BTreeSet<String> = seeds.audit_token_keys.into_iter().collect();

    let validator = BucketValidator::from_fixture(&fixture, Some(&audit_tokens))
        .expect("validator construction succeeds");
    (fixture, validator)
}

fn champion_state() -> AnnealState {
    // Champion 9.203609845305 state:
    // firstKeys: BCSDFGHJKLMNKQRSPTXZRRRWYE
    // rhymeKeys:
    // upper: ['E', 'T', 'W', 'P', 'Q', 'Y', 'E', 'R', 'Y', 'T']
    // home:  ['S', 'K', 'D', 'G', 'L', 'J', 'H', 'F', 'K', 'H']
    // lower: ['Z', 'N', 'M', 'C', 'M', 'X', 'N', 'B', 'N', 'C']
    let first_keys: Vec<char> = "BCSDFGHJKLMNKQRSPTXZRRRWYE".chars().collect();
    let rhyme_keys = vec![
        vec!['E', 'T', 'W', 'P', 'Q', 'Y', 'E', 'R', 'Y', 'T'],
        vec!['S', 'K', 'D', 'G', 'L', 'J', 'H', 'F', 'K', 'H'],
        vec!['Z', 'N', 'M', 'C', 'M', 'X', 'N', 'B', 'N', 'C'],
    ];
    AnnealState {
        first_keys,
        rhyme_keys,
    }
}

fn seed1_state() -> AnnealState {
    // Seed 1 (Low M/D, 9.312083136687):
    // Champion rhymes with lower:u -> Z, lower:a-ou -> N
    // rhyme 0 (a-ou) -> N, rhyme 6 (u) -> Z
    let mut state = champion_state();
    state.rhyme_keys[2][0] = 'N';
    state.rhyme_keys[2][6] = 'Z';
    state
}

fn seed2_state() -> AnnealState {
    // Seed 2 (Comprehensive, 9.266891573171):
    // p -> K (already K in champion), q -> C (atom 13), zero-E -> Q (atom 21)
    let mut state = champion_state();
    state.first_keys[13] = 'C';
    state.first_keys[21] = 'Q';
    state
}

fn seed3_state() -> AnnealState {
    // Seed 3 (Performance, 9.261537631429):
    // p -> K (already K), q -> R (atom 13), r -> Q (atom 14)
    let mut state = champion_state();
    state.first_keys[13] = 'R';
    state.first_keys[14] = 'Q';
    state
}

#[test]
fn test_unconstrained_champion_rejected_by_qz_empty_due_to_qia1_and_qiu1() {
    let (_, validator) = load_fixture_and_validator();
    let champ = champion_state();
    let forbidden = [('Q', 'Z')];

    assert!(!validator.is_valid_forbidden(&champ, &forbidden));

    let violations = validator.find_forbidden_violations(&champ, &forbidden);
    assert_eq!(violations.len(), 2);
    assert_eq!(violations[0], ("QZ".to_owned(), "qia1".to_owned()));
    assert_eq!(violations[1], ("QZ".to_owned(), "qiu1".to_owned()));
}

#[test]
fn test_legal_seeds_pass_qz_empty_constraint() {
    let (_, validator) = load_fixture_and_validator();
    let forbidden = [('Q', 'Z')];

    // Seed 1: lower: u->Z, lower: a-ou->N
    let s1 = seed1_state();
    assert!(validator.is_valid_forbidden(&s1, &forbidden));
    assert!(
        validator
            .find_forbidden_violations(&s1, &forbidden)
            .is_empty()
    );

    // Seed 2: p->K, q->C, zero-E->Q
    let s2 = seed2_state();
    assert!(validator.is_valid_forbidden(&s2, &forbidden));
    assert!(
        validator
            .find_forbidden_violations(&s2, &forbidden)
            .is_empty()
    );

    // Seed 3: p->K, q->R, r->Q
    let s3 = seed3_state();
    assert!(validator.is_valid_forbidden(&s3, &forbidden));
    assert!(
        validator
            .find_forbidden_violations(&s3, &forbidden)
            .is_empty()
    );
}

#[test]
fn test_zq_occupied_is_not_rejected_when_only_qz_is_forbidden() {
    let (_, validator) = load_fixture_and_validator();
    let forbidden_qz = [('Q', 'Z')];
    let forbidden_zq = [('Z', 'Q')];

    for (name, state) in [
        ("seed1", seed1_state()),
        ("seed2", seed2_state()),
        ("seed3", seed3_state()),
    ] {
        // ZQ is indeed occupied by zan4 and zuan4
        let zq_violations = validator.find_forbidden_violations(&state, &forbidden_zq);
        assert!(
            !zq_violations.is_empty(),
            "{name} should have occupied ZQ bucket"
        );
        let zq_syllables: Vec<String> = zq_violations.iter().map(|(_, s)| s.clone()).collect();
        assert!(zq_syllables.contains(&"zan4".to_owned()));
        assert!(zq_syllables.contains(&"zuan4".to_owned()));

        // Under QZ-only forbidden constraint, it MUST NOT be rejected!
        assert!(
            validator.is_valid_forbidden(&state, &forbidden_qz),
            "{name} must not be rejected when only QZ is forbidden"
        );
    }
}

#[test]
fn test_resume_contract_validation_and_mismatch_errors() {
    let (fixture, _) = load_fixture_and_validator();
    let state = seed1_state();

    let valid_cp = AnnealCheckpoint {
        version: JOINT_ANNEAL_VERSION.to_owned(),
        fixture_id: Some(fixture.layout_id.clone()),
        layout_id: Some(fixture.layout_id.clone()),
        source_hashes: fixture.source_hashes.clone(),
        require_empty_buckets: vec!["QZ".to_owned()],
        max_d: 1,
        rhyme_only: false,
        step: 100,
        total_steps: 1000,
        temperature: 0.01,
        current_score: 9.30,
        best_score: 9.29,
        base_score: 9.31,
        accepted: 20,
        evaluated: 80,
        rejected_forbidden: 5,
        elapsed_ms: 1234.5,
        current_state: state.clone(),
        best_state: state.clone(),
        history: vec![],
        diagnostics: None,
        pareto_frontier: vec![],
    };

    // Valid resume matches perfectly
    assert!(
        valid_cp
            .validate_resume_contract(
                &fixture.layout_id,
                &fixture.source_hashes,
                &["QZ".to_owned()],
                1
            )
            .is_ok()
    );

    // 1. Version mismatch
    let mut bad_version = valid_cp.clone();
    bad_version.version = "ckt-v51-toned-2121-joint-anneal-v1".to_owned();
    let err = bad_version
        .validate_resume_contract(
            &fixture.layout_id,
            &fixture.source_hashes,
            &["QZ".to_owned()],
            1,
        )
        .unwrap_err();
    assert!(err.contains("version mismatch"));

    // 2. Fixture ID mismatch
    let mut bad_fixture = valid_cp.clone();
    bad_fixture.fixture_id = Some("DIFFERENT-FIXTURE-ID".to_owned());
    bad_fixture.layout_id = Some("DIFFERENT-FIXTURE-ID".to_owned());
    let err = bad_fixture
        .validate_resume_contract(
            &fixture.layout_id,
            &fixture.source_hashes,
            &["QZ".to_owned()],
            1,
        )
        .unwrap_err();
    assert!(err.contains("fixture_id mismatch"));

    // 3. Max D mismatch
    let mut bad_max_d = valid_cp.clone();
    bad_max_d.max_d = 2;
    let err = bad_max_d
        .validate_resume_contract(
            &fixture.layout_id,
            &fixture.source_hashes,
            &["QZ".to_owned()],
            1,
        )
        .unwrap_err();
    assert!(err.contains("max_d mismatch"));

    // 4. Require empty buckets mismatch
    let mut bad_buckets = valid_cp.clone();
    bad_buckets.require_empty_buckets = vec!["QZ".to_owned(), "ZQ".to_owned()];
    let err = bad_buckets
        .validate_resume_contract(
            &fixture.layout_id,
            &fixture.source_hashes,
            &["QZ".to_owned()],
            1,
        )
        .unwrap_err();
    assert!(err.contains("require_empty_buckets mismatch"));

    // 5. Source hashes mismatch
    let mut bad_hashes = valid_cp.clone();
    let mut altered_hashes = fixture.source_hashes.clone();
    altered_hashes.insert("html".to_owned(), "0000000000000000".to_owned());
    bad_hashes.source_hashes = altered_hashes;
    let err = bad_hashes
        .validate_resume_contract(
            &fixture.layout_id,
            &fixture.source_hashes,
            &["QZ".to_owned()],
            1,
        )
        .unwrap_err();
    assert!(err.contains("source_hashes mismatch"));
}

#[test]
fn test_diagnostics_bucket_counts_and_empty_list() {
    let (fixture, validator) = load_fixture_and_validator();
    let s1 = seed1_state();
    let diag = validator.compute_diagnostics(&s1, &fixture);

    assert!(diag.qz_empty);
    assert_eq!(diag.ordinary_d, 1);
    assert_eq!(diag.ordinary_f, 0);
    assert_eq!(diag.memory_lower, 21);
    assert_eq!(diag.memory_guard, 23);
    assert_eq!(diag.rhyme_internal_splits, 0);
    assert_eq!(
        diag.layout1407_occupied_buckets + diag.layout1407_empty_buckets_count,
        441
    );
    assert_eq!(
        diag.common1237_occupied_buckets + diag.common1237_empty_buckets_count,
        441
    );
    assert!(diag.layout1407_empty_buckets.contains(&"QZ".to_owned()));
    assert!(diag.common1237_empty_buckets.contains(&"QZ".to_owned()));
    // ZQ should NOT be in empty buckets
    assert!(!diag.layout1407_empty_buckets.contains(&"ZQ".to_owned()));

    // Verify Seed 2 counts zero-E independently from zero-A and zero-O
    let s2 = seed2_state();
    let diag2 = validator.compute_diagnostics(&s2, &fixture);
    assert_eq!(diag2.ordinary_d, 2);
    assert_eq!(diag2.memory_lower, 23);
    assert_eq!(diag2.special_first_moves, 3); // ch->S, sh->P, zero-E->Q
    assert_eq!(diag2.first_group_moves, 5); // 2 ordinary (p,q) + 3 special
}

#[test]
fn test_pareto_frontier_preserves_non_dominated_tiers() {
    let s1 = seed1_state();
    let s2 = seed2_state();
    let s3 = seed3_state();

    let mut frontier = Vec::new();
    // Low M/D point: D=1, M=21, CKT=9.31
    assert!(update_pareto_frontier(
        &mut frontier,
        ParetoEntry {
            score: 9.31,
            ordinary_d: 1,
            memory_lower: 21,
            memory_guard: 23,
            merge_lower: 9,
            first_group_moves: 3,
            rhyme_group_moves: 10,
            rhyme_internal_splits: 0,
            step: 0,
            description: "tier1".to_owned(),
            state: s1.clone(),
            diagnostics: None,
        }
    ));
    // Higher D/M but lower CKT: D=2, M=23, CKT=9.26 -> non-dominated!
    assert!(update_pareto_frontier(
        &mut frontier,
        ParetoEntry {
            score: 9.26,
            ordinary_d: 2,
            memory_lower: 23,
            memory_guard: 25,
            merge_lower: 9,
            first_group_moves: 5,
            rhyme_group_moves: 10,
            rhyme_internal_splits: 0,
            step: 1,
            description: "tier2".to_owned(),
            state: s2.clone(),
            diagnostics: None,
        }
    ));
    assert_eq!(frontier.len(), 2);

    // Dominated higher D/M with worse CKT -> rejected!
    assert!(!update_pareto_frontier(
        &mut frontier,
        ParetoEntry {
            score: 9.27,
            ordinary_d: 3,
            memory_lower: 23,
            memory_guard: 25,
            merge_lower: 9,
            first_group_moves: 5,
            rhyme_group_moves: 10,
            rhyme_internal_splits: 0,
            step: 2,
            description: "dominated".to_owned(),
            state: s3.clone(),
            diagnostics: None,
        }
    ));
    assert_eq!(frontier.len(), 2);

    // Lower CKT at SAME tier dominates older point
    assert!(update_pareto_frontier(
        &mut frontier,
        ParetoEntry {
            score: 9.23,
            ordinary_d: 1,
            memory_lower: 21,
            memory_guard: 23,
            merge_lower: 9,
            first_group_moves: 3,
            rhyme_group_moves: 10,
            rhyme_internal_splits: 0,
            step: 3,
            description: "super-lowmd".to_owned(),
            state: s1,
            diagnostics: None,
        }
    ));
    // Note: (D=1, M=21, 9.23) ALSO dominates (D=2, M=23, 9.26)!
    assert_eq!(frontier.len(), 1);
    assert_eq!(frontier[0].score, 9.23);
}
