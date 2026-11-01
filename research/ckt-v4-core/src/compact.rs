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

    pub fn from_bits_len(bits: u64, len: u8) -> Result<Self, String> {
        if !(1..=Self::MAX_LEN as u8).contains(&len) {
            return Err(format!(
                "code length must be 1..={}, got {len}",
                Self::MAX_LEN
            ));
        }
        if bits >> (usize::from(len) * 6) != 0 {
            return Err("packed code has bits outside its declared length".to_owned());
        }
        for position in 0..len {
            let value = (bits >> (usize::from(position) * 6)) & 0x3f;
            if !(1..=34).contains(&value) {
                return Err(format!("invalid packed key value {value}"));
            }
        }
        Ok(Self { bits, len })
    }

    #[cfg(feature = "cuda")]
    pub(crate) fn from_valid_bits_len(bits: u64, len: u8) -> Self {
        debug_assert!(Self::from_bits_len(bits, len).is_ok());
        Self { bits, len }
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

    #[test]
    fn raw_packed_codes_are_validated() {
        let alphabet = KeyAlphabet::new("ABCDEFGHIJKLMNOPQRSTUVWXYZ[]\\;',./").unwrap();
        let code = alphabet.pack("A/BCDE").unwrap();
        assert_eq!(PackedCode::from_bits_len(code.bits(), 6).unwrap(), code);
        assert!(PackedCode::from_bits_len(0, 1).is_err());
        assert!(PackedCode::from_bits_len(35, 1).is_err());
        assert!(PackedCode::from_bits_len(1 << 6, 1).is_err());
    }
}
