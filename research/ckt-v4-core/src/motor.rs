use crate::compact::{KeyAlphabet, PackedCode};
use base64::Engine;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Clone, Debug)]
pub struct RoleTablesInput {
    pub native_keys: String,
    pub l2i1: Vec<f32>,
    pub l3i1: Vec<f32>,
    pub l3i2: Vec<f32>,
    pub l4i1: Vec<f32>,
    pub l4i2: Vec<f32>,
    pub l4i3: Vec<f32>,
    pub continuation_guard_ms: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MotorValue {
    pub upper_ms: f64,
    pub exact: bool,
    pub projected: bool,
    pub extension_guard: f64,
}

#[derive(Clone, Debug)]
pub struct RoleTables {
    size: usize,
    native_index: [Option<u8>; 34],
    input: RoleTablesInput,
}

impl RoleTables {
    pub fn from_snapshot_json(
        global: &KeyAlphabet,
        json: &str,
        continuation_guard_ms: f64,
    ) -> Result<Self, String> {
        #[derive(Deserialize)]
        struct Table {
            base64: String,
            dtype: String,
        }
        #[derive(Deserialize)]
        struct Snapshot {
            keys: String,
            tables: HashMap<String, Table>,
        }
        fn decode(tables: &HashMap<String, Table>, name: &str) -> Result<Vec<f32>, String> {
            let table = tables
                .get(name)
                .ok_or_else(|| format!("snapshot is missing {name}"))?;
            if !matches!(
                table.dtype.as_str(),
                "float32" | "float32-le" | "<f4" | "Float32Array"
            ) {
                return Err(format!("unsupported {name} dtype {:?}", table.dtype));
            }
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(&table.base64)
                .map_err(|error| format!("invalid {name} base64: {error}"))?;
            let (chunks, remainder) = bytes.as_chunks::<4>();
            if !remainder.is_empty() {
                return Err(format!("{name} byte length is not divisible by four"));
            }
            Ok(chunks
                .iter()
                .map(|chunk| f32::from_le_bytes(*chunk))
                .collect())
        }
        let snapshot: Snapshot = serde_json::from_str(json).map_err(|error| error.to_string())?;
        let input = RoleTablesInput {
            native_keys: snapshot.keys,
            l2i1: decode(&snapshot.tables, "L2i1")?,
            l3i1: decode(&snapshot.tables, "L3i1")?,
            l3i2: decode(&snapshot.tables, "L3i2")?,
            l4i1: decode(&snapshot.tables, "L4i1")?,
            l4i2: decode(&snapshot.tables, "L4i2")?,
            l4i3: decode(&snapshot.tables, "L4i3")?,
            continuation_guard_ms,
        };
        Self::new(global, input)
    }

    pub fn new(global: &KeyAlphabet, input: RoleTablesInput) -> Result<Self, String> {
        let native: Vec<char> = input.native_keys.chars().collect();
        let size = native.len();
        if !(2..=34).contains(&size) {
            return Err(format!("invalid native key count {size}"));
        }
        let expected = [
            ("L2i1", input.l2i1.len(), size.pow(2)),
            ("L3i1", input.l3i1.len(), size.pow(3)),
            ("L3i2", input.l3i2.len(), size.pow(3)),
            ("L4i1", input.l4i1.len(), size.pow(3)),
            ("L4i2", input.l4i2.len(), size.pow(4)),
            ("L4i3", input.l4i3.len(), size.pow(3)),
        ];
        for (name, actual, wanted) in expected {
            if actual != wanted {
                return Err(format!(
                    "{name} contains {actual} values; expected {wanted}"
                ));
            }
        }
        let mut native_index = [None; 34];
        for (native_slot, key) in native.into_iter().enumerate() {
            let packed = global.pack(&key.to_string())?;
            let global_slot = packed.indices().next().unwrap();
            if native_index[usize::from(global_slot)]
                .replace(native_slot as u8)
                .is_some()
            {
                return Err(format!("duplicate native key {key:?}"));
            }
        }
        Ok(Self {
            size,
            native_index,
            input,
        })
    }

    fn offset(&self, values: &[u8]) -> usize {
        values.iter().fold(0_usize, |offset, &value| {
            offset * self.size + usize::from(value)
        })
    }

    pub fn cost(&self, code: PackedCode) -> Option<MotorValue> {
        if code.len() < 2 {
            return None;
        }
        let native: Option<Vec<u8>> = code
            .indices()
            .map(|index| self.native_index[usize::from(index)])
            .collect();
        let values = native?;
        let (upper_ms, exact) = match values.len() {
            2 => (f64::from(self.input.l2i1[self.offset(&values)]), true),
            3 => (
                f64::from(self.input.l3i1[self.offset(&values)])
                    + f64::from(self.input.l3i2[self.offset(&values)]),
                true,
            ),
            length => {
                let mut total = f64::from(self.input.l4i1[self.offset(&values[..3])])
                    + f64::from(self.input.l4i3[self.offset(&values[length - 3..])]);
                for window in values.windows(4) {
                    total += f64::from(self.input.l4i2[self.offset(window)]);
                }
                if length > 4 {
                    total += (length - 4) as f64 * self.input.continuation_guard_ms;
                }
                (total, length == 4)
            }
        };
        Some(MotorValue {
            upper_ms,
            exact,
            projected: false,
            extension_guard: 1.0,
        })
    }
}

#[derive(Clone, Debug)]
pub struct Projection {
    pub donors: Vec<(u8, f64)>,
    pub distance_guard_multiplier: f64,
}

#[derive(Clone, Debug)]
pub struct ProjectedMotor {
    native: RoleTables,
    projections: HashMap<u8, Projection>,
}

impl ProjectedMotor {
    pub fn new(native: RoleTables, projections: HashMap<u8, Projection>) -> Result<Self, String> {
        for (&key, projection) in &projections {
            if key >= 34 || projection.donors.is_empty() {
                return Err(format!("invalid projection for key {key}"));
            }
            let total: f64 = projection.donors.iter().map(|(_, weight)| *weight).sum();
            if projection
                .donors
                .iter()
                .any(|(donor, weight)| *donor >= 34 || *weight <= 0.0)
                || (total - 1.0).abs() > 1e-9
                || projection.distance_guard_multiplier < 1.0
            {
                return Err(format!("invalid projection weights/guard for key {key}"));
            }
        }
        Ok(Self {
            native,
            projections,
        })
    }

    pub fn cost(&self, code: PackedCode) -> Option<MotorValue> {
        let mut variants: Vec<(Vec<u8>, f64)> = vec![(Vec::with_capacity(code.len()), 1.0)];
        let mut guard = 1.0_f64;
        let mut projected = false;
        for key in code.indices() {
            if self.native.native_index[usize::from(key)].is_some() {
                for (variant, _) in &mut variants {
                    variant.push(key);
                }
                continue;
            }
            let projection = self.projections.get(&key)?;
            projected = true;
            guard = guard.max(projection.distance_guard_multiplier);
            let mut expanded = Vec::with_capacity(variants.len() * projection.donors.len());
            for (variant, variant_weight) in variants {
                for &(donor, donor_weight) in &projection.donors {
                    let mut next = variant.clone();
                    next.push(donor);
                    expanded.push((next, variant_weight * donor_weight));
                }
            }
            variants = expanded;
        }
        let mut upper_ms = 0.0;
        let mut exact = !projected;
        for (indices, weight) in variants {
            let packed = PackedCode::from_indices(&indices).ok()?;
            let value = self.native.cost(packed)?;
            upper_ms += weight * value.upper_ms;
            exact &= value.exact;
        }
        Some(MotorValue {
            upper_ms: upper_ms * guard,
            exact,
            projected,
            extension_guard: guard,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn table(length: u32, value: f32) -> Vec<f32> {
        vec![value; 2_usize.pow(length)]
    }

    #[test]
    fn role_continuation_matches_the_js_reference_formula() {
        let alphabet = KeyAlphabet::new("ABCDEFGHIJKLMNOPQRSTUVWXYZ[]\\;',./").unwrap();
        let native = RoleTables::new(
            &alphabet,
            RoleTablesInput {
                native_keys: "AB".to_owned(),
                l2i1: table(2, 2.0),
                l3i1: table(3, 3.0),
                l3i2: table(3, 5.0),
                l4i1: table(3, 7.0),
                l4i2: table(4, 11.0),
                l4i3: table(3, 13.0),
                continuation_guard_ms: 17.0,
            },
        )
        .unwrap();
        assert_eq!(
            native.cost(alphabet.pack("AB").unwrap()).unwrap().upper_ms,
            2.0
        );
        assert_eq!(
            native.cost(alphabet.pack("ABA").unwrap()).unwrap().upper_ms,
            8.0
        );
        assert_eq!(
            native
                .cost(alphabet.pack("ABAB").unwrap())
                .unwrap()
                .upper_ms,
            31.0
        );
        let five = native.cost(alphabet.pack("ABABA").unwrap()).unwrap();
        assert_eq!(five.upper_ms, 59.0);
        assert!(!five.exact);
    }
}
