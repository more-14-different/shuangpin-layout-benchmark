use std::collections::HashMap;

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct PackedCode {
    bits: u64,
    len: u8,
}

impl PackedCode {
    pub const MAX_LEN: usize = 6;

    pub fn from_indices(indices: &[u8]) -> Result<Self, String> {
        if indices.is_empty() || indices.len() > Self::MAX_LEN {
            return Err(format!(
                "code length must be 1..={}, got {}",
                Self::MAX_LEN,
                indices.len()
            ));
        }
        let mut bits = 0_u64;
        for &index in indices {
            if index >= 34 {
                return Err(format!("key index {index} is outside the 34-key domain"));
            }
            bits = (bits << 6) | u64::from(index + 1);
        }
        Ok(Self {
            bits,
            len: indices.len() as u8,
        })
    }

    pub fn len(self) -> usize {
        usize::from(self.len)
    }

    pub fn is_empty(self) -> bool {
        false
    }

    pub fn bits(self) -> u64 {
        self.bits
    }

    pub fn indices(self) -> impl DoubleEndedIterator<Item = u8> {
        let len = self.len;
        (0..len).map(move |position| {
            let shift = 6 * (len - position - 1);
            (((self.bits >> shift) & 0x3f) as u8) - 1
        })
    }
}

#[derive(Clone, Debug)]
pub struct KeyAlphabet {
    keys: Vec<char>,
    index: HashMap<char, u8>,
}

impl KeyAlphabet {
    pub fn new(keys: &str) -> Result<Self, String> {
        let keys: Vec<char> = keys.chars().collect();
        if keys.len() != 34 {
            return Err(format!(
                "CKT v4 alphabet must contain 34 keys, got {}",
                keys.len()
            ));
        }
        let index: HashMap<char, u8> = keys
            .iter()
            .copied()
            .enumerate()
            .map(|(i, key)| (key, i as u8))
            .collect();
        if index.len() != keys.len() {
            return Err("CKT v4 alphabet contains duplicate keys".to_owned());
        }
        Ok(Self { keys, index })
    }

    pub fn pack(&self, code: &str) -> Result<PackedCode, String> {
        let mut indices = Vec::with_capacity(code.len());
        for key in code.chars() {
            indices.push(
                *self
                    .index
                    .get(&key)
                    .ok_or_else(|| format!("unknown key {key:?}"))?,
            );
        }
        PackedCode::from_indices(&indices)
    }

    pub fn index_of(&self, key: char) -> Option<u8> {
        self.index.get(&key).copied()
    }

    pub fn unpack(&self, code: PackedCode) -> String {
        code.indices()
            .map(|index| self.keys[usize::from(index)])
            .collect()
    }

    pub fn sort_codes_js(&self, codes: &mut [PackedCode]) {
        codes.sort_unstable_by(|left, right| {
            self.unpack(*left)
                .encode_utf16()
                .cmp(self.unpack(*right).encode_utf16())
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packed_codes_preserve_leading_zero_and_lexical_order() {
        let alphabet = KeyAlphabet::new("ABCDEFGHIJKLMNOPQRSTUVWXYZ[]\\;',./").unwrap();
        for raw in ["A", "ABCD", "[A]", "A/BCDE"] {
            let packed = alphabet.pack(raw).unwrap();
            assert_eq!(alphabet.unpack(packed), raw);
        }
        assert!(alphabet.pack("ABCD").unwrap() < alphabet.pack("ABCE").unwrap());
    }
}
