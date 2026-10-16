use crate::{Contract, KeyAlphabet, SchemeFixture, SchemeInput, SchemeState};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityReason {
    Supported,
    ForwardInvalid,
    CommonHeadSplit,
    CommonFinalSplit,
    RegularIncomplete,
    RegularInvalid,
    CommonRoundTripMismatch,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Common399Policy {
    AllowCollisions,
    RequireUnique,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemeCapability {
    pub id: String,
    pub capacity: [u8; 2],
    pub forward_score: bool,
    pub regular_anneal: bool,
    pub common_round_trip: bool,
    pub extension_round_trip: bool,
    pub contract: Contract,
    pub common399_policy: Common399Policy,
    pub reason_code: CapabilityReason,
    pub detail: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityAudit {
    pub version: &'static str,
    pub key_alphabet: String,
    pub source_hashes: HashMap<String, String>,
    pub schemes: Vec<SchemeCapability>,
}

pub fn audit_fixture(fixture: &SchemeFixture) -> Result<CapabilityAudit, String> {
    let alphabet = KeyAlphabet::new(&fixture.key_alphabet)?;
    Ok(CapabilityAudit {
        version: "ckt-v4-capability-audit-1",
        key_alphabet: fixture.key_alphabet.clone(),
        source_hashes: fixture.source_hashes.clone(),
        schemes: fixture
            .schemes
            .iter()
            .map(|input| audit_scheme(fixture, input, &alphabet))
            .collect(),
    })
}

pub fn audit_scheme(
    fixture: &SchemeFixture,
    input: &SchemeInput,
    alphabet: &KeyAlphabet,
) -> SchemeCapability {
    let contract = contract_for(input.capacity);
    let common399_policy = common_policy(input.capacity);
    let base = |reason_code, detail| SchemeCapability {
        id: input.id.clone(),
        capacity: input.capacity,
        forward_score: false,
        regular_anneal: false,
        common_round_trip: false,
        extension_round_trip: false,
        contract,
        common399_policy,
        reason_code,
        detail,
    };

    let forward = match SchemeState::compile(input, alphabet, fixture.pinyin_map.len()) {
        Ok(state) => state,
        Err(detail) => return base(CapabilityReason::ForwardInvalid, detail),
    };
    let mut result = base(CapabilityReason::RegularIncomplete, String::new());
    result.forward_score = true;

    if let Err((reason, detail)) = check_common_factorization(fixture, &forward) {
        result.reason_code = reason;
        result.detail = detail;
        return result;
    }
    let layout = match fixture.compile_layout(input, alphabet) {
        Ok(layout) => layout,
        Err(detail) => {
            result.reason_code = CapabilityReason::RegularInvalid;
            result.detail = detail;
            return result;
        }
    };
    let rebuilt = match fixture.scheme_state(&layout) {
        Ok(state) => state,
        Err(detail) => {
            result.reason_code = CapabilityReason::RegularInvalid;
            result.detail = detail;
            return result;
        }
    };
    result.common_round_trip = fixture
        .common_pinyin
        .iter()
        .all(|&index| forward.code_at(usize::from(index)) == rebuilt.code_at(usize::from(index)));
    if !result.common_round_trip {
        result.reason_code = CapabilityReason::CommonRoundTripMismatch;
        result.detail = "regular state does not reproduce Common399".to_owned();
        return result;
    }
    let common: HashSet<_> = fixture
        .common_pinyin
        .iter()
        .map(|&index| usize::from(index))
        .collect();
    result.extension_round_trip = (0..fixture.pinyin_map.len())
        .filter(|index| !common.contains(index))
        .all(|index| forward.code_at(index) == rebuilt.code_at(index));
    result.regular_anneal = true;
    result.reason_code = CapabilityReason::Supported;
    result.detail = if result.extension_round_trip {
        "Common399 and extension codes round-trip through the regular state".to_owned()
    } else {
        "Common399 round-trips; extension-only codes differ and are outside the frozen corpus"
            .to_owned()
    };
    result
}

fn check_common_factorization(
    fixture: &SchemeFixture,
    state: &SchemeState,
) -> Result<(), (CapabilityReason, String)> {
    let mut heads = [None; 27];
    let mut finals = [None; 35];
    for &pinyin_index in &fixture.common_pinyin {
        let index = usize::from(pinyin_index);
        let [head, final_index] =
            fixture.pinyin_map.get(index).copied().ok_or_else(|| {
                incomplete(format!("Common399 index {index} is outside topology"))
            })?;
        if head >= 27 || final_index >= 35 {
            return Err(incomplete(format!(
                "Common399 pinyin {index} is outside the regular 27+35 topology"
            )));
        }
        let [first, second] = state
            .code_at(index)
            .ok_or_else(|| incomplete(format!("Common399 pinyin {index} has no two-key code")))?;
        assign_slot(
            &mut heads[usize::from(head)],
            first,
            CapabilityReason::CommonHeadSplit,
            format!("head {head} at pinyin {index} maps to multiple keys"),
        )?;
        assign_slot(
            &mut finals[usize::from(final_index)],
            second,
            CapabilityReason::CommonFinalSplit,
            format!("final {final_index} at pinyin {index} maps to multiple keys"),
        )?;
    }
    if heads.contains(&None) || finals.contains(&None) {
        return Err(incomplete(
            "Common399 does not cover all 27 head and 35 final states".to_owned(),
        ));
    }
    Ok(())
}

fn assign_slot(
    target: &mut Option<u8>,
    value: u8,
    reason: CapabilityReason,
    detail: String,
) -> Result<(), (CapabilityReason, String)> {
    match target {
        None => {
            *target = Some(value);
            Ok(())
        }
        Some(existing) if *existing == value => Ok(()),
        Some(_) => Err((reason, detail)),
    }
}

fn incomplete(detail: String) -> (CapabilityReason, String) {
    (CapabilityReason::RegularIncomplete, detail)
}

fn contract_for(capacity: [u8; 2]) -> Contract {
    if capacity == [21, 21] {
        Contract::Traditional21x21
    } else {
        Contract::FourCodeTop
    }
}

fn common_policy(capacity: [u8; 2]) -> Common399Policy {
    if matches!(capacity, [21, 21] | [23, 23]) {
        Common399Policy::AllowCollisions
    } else {
        Common399Policy::RequireUnique
    }
}
