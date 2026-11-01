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

    fn cost_indices(&self, values: &[u8]) -> MotorValue {
        let (upper_ms, exact) = match values.len() {
            2 => (f64::from(self.input.l2i1[self.offset(values)]), true),
            3 => (
                f64::from(self.input.l3i1[self.offset(values)])
                    + f64::from(self.input.l3i2[self.offset(values)]),
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
        MotorValue {
            upper_ms,
            exact,
            projected: false,
            extension_guard: 1.0,
        }
    }

    pub fn cost(&self, code: PackedCode) -> Option<MotorValue> {
        if code.len() < 2 {
            return None;
        }
        let mut values = [0_u8; PackedCode::MAX_LEN];
        for (position, index) in code.indices().enumerate() {
            values[position] = self.native_index[usize::from(index)]?;
        }
        Some(self.cost_indices(&values[..code.len()]))
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
        if code.len() < 2 {
            return None;
        }
        let mut keys = [0_u8; PackedCode::MAX_LEN];
        let mut native_values = [0_u8; PackedCode::MAX_LEN];
        let mut guard = 1.0_f64;
        let mut projected = false;
        for (position, key) in code.indices().enumerate() {
            keys[position] = key;
            if let Some(native) = self.native.native_index[usize::from(key)] {
                native_values[position] = native;
            } else {
                let projection = self.projections.get(&key)?;
                projected = true;
                guard = guard.max(projection.distance_guard_multiplier);
            }
        }
        if !projected {
            return Some(self.native.cost_indices(&native_values[..code.len()]));
        }

        let mut upper_ms = 0.0;
        let mut exact = false;
        self.accumulate_projected(
            &keys[..code.len()],
            0,
            &mut native_values,
            1.0,
            &mut upper_ms,
            &mut exact,
        )?;
        Some(MotorValue {
            upper_ms: upper_ms * guard,
            exact,
            projected: true,
            extension_guard: guard,
        })
    }

    fn accumulate_projected(
        &self,
        keys: &[u8],
        position: usize,
        native_values: &mut [u8; PackedCode::MAX_LEN],
        weight: f64,
        upper_ms: &mut f64,
        exact: &mut bool,
    ) -> Option<()> {
        if position == keys.len() {
            let value = self.native.cost_indices(&native_values[..keys.len()]);
            *upper_ms += weight * value.upper_ms;
            *exact &= value.exact;
            return Some(());
        }
        let key = keys[position];
        if let Some(native) = self.native.native_index[usize::from(key)] {
            native_values[position] = native;
            return self.accumulate_projected(
                keys,
                position + 1,
                native_values,
                weight,
                upper_ms,
                exact,
            );
        }
        for &(donor, donor_weight) in &self.projections.get(&key)?.donors {
            native_values[position] = self.native.native_index[usize::from(donor)]?;
            self.accumulate_projected(
                keys,
                position + 1,
                native_values,
                weight * donor_weight,
                upper_ms,
                exact,
            )?;
        }
        Some(())
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

    #[test]
    fn projected_motor_preserves_donor_order_weights_and_guard() {
        let alphabet = KeyAlphabet::new("ABCDEFGHIJKLMNOPQRSTUVWXYZ[]\\;',./").unwrap();
        let native = RoleTables::new(
            &alphabet,
            RoleTablesInput {
                native_keys: "AB".to_owned(),
                l2i1: vec![10.0, 20.0, 30.0, 40.0],
                l3i1: table(3, 0.0),
                l3i2: table(3, 0.0),
                l4i1: table(3, 0.0),
                l4i2: table(4, 0.0),
                l4i3: table(3, 0.0),
                continuation_guard_ms: 0.0,
            },
        )
        .unwrap();
        let projection_key = alphabet.index_of('C').unwrap();
        let projections = HashMap::from([(
            projection_key,
            Projection {
                donors: vec![
                    (alphabet.index_of('A').unwrap(), 0.25),
                    (alphabet.index_of('B').unwrap(), 0.75),
                ],
                distance_guard_multiplier: 1.2,
            },
        )]);
        let motor = ProjectedMotor::new(native, projections).unwrap();

        let native_value = motor.cost(alphabet.pack("BA").unwrap()).unwrap();
        assert_eq!(native_value.upper_ms, 30.0);
        assert!(native_value.exact);
        assert!(!native_value.projected);

        let projected = motor.cost(alphabet.pack("CA").unwrap()).unwrap();
        assert_eq!(projected.upper_ms, 30.0);
        assert!(!projected.exact);
        assert!(projected.projected);
        assert_eq!(projected.extension_guard, 1.2);

        let double = motor.cost(alphabet.pack("CC").unwrap()).unwrap();
        assert_eq!(double.upper_ms, 39.0);
    }
}
