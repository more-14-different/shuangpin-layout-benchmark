//! Weighted selected-terminal key frequencies, including shape completion keys.
use crate::{KeyAlphabet, PackedCode};

pub struct PinkyTotals {
    hits: [f64; 4],
    left: [f64; 4],
    right: [f64; 4],
    left_keys: [bool; 34],
    right_key: u8,
}

impl PinkyTotals {
    pub fn new(alphabet: &KeyAlphabet) -> Self {
        let mut left_keys = [false; 34];
        for key in ['Q', 'A', 'Z'] {
            left_keys[alphabet.index_of(key).expect("QAZ in alphabet") as usize] = true;
        }
        Self { hits: [0.0; 4], left: [0.0; 4], right: [0.0; 4], left_keys,
            right_key: alphabet.index_of('P').expect("P in alphabet") }
    }

    // Row kind and weight are invariant when native layout updates change codes.
    pub fn add(&mut self, kind: usize, weight: f64, code: PackedCode) {
        self.hits[kind] += weight * code.len() as f64;
        for key in code.indices() {
            if self.left_keys[key as usize] { self.left[kind] += weight; }
            if key == self.right_key { self.right[kind] += weight; }
        }
    }

    pub fn tracks(&self) -> ([f64; 4], [f64; 4]) {
        let load = |values: &[f64; 4]| std::array::from_fn(|i|
            if self.hits[i] > 0.0 { values[i] / self.hits[i] } else { 0.0 });
        (load(&self.left), load(&self.right))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn weighted_repeats_auxiliary_keys_updates_and_rollback() {
        let a = KeyAlphabet::new("ABCDEFGHIJKLMNOPQRSTUVWXYZ[]\\;',./").unwrap();
        let mut p = PinkyTotals::new(&a);
        p.add(0, 2.0, a.pack("QAPP").unwrap());
        p.add(1, 1.0, a.pack("PBBB").unwrap());
        let original = p.tracks();
        assert_eq!(original, ([0.5, 0.0, 0.0, 0.0], [0.5, 0.25, 0.0, 0.0]));
        p.add(0, -2.0, a.pack("QAPP").unwrap());
        p.add(0, 2.0, a.pack("ABCD").unwrap());
        assert_eq!(p.tracks(), ([0.25, 0.0, 0.0, 0.0], [0.0, 0.25, 0.0, 0.0]));
        p.add(0, -2.0, a.pack("ABCD").unwrap());
        p.add(0, 2.0, a.pack("QAPP").unwrap());
        assert_eq!(p.tracks(), original);
    }
}
