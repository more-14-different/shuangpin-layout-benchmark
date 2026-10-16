use crate::{BinaryExtension, Contract, KeyAlphabet, Kind, PackedCode, Row, Stage, stage_pools};
use serde::Deserialize;
use std::collections::{BTreeSet, HashMap};
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

const MAGIC: &[u8; 8] = b"CKTV4COR";
const FORMAT_VERSION: u16 = 1;
const FILE_END: u32 = 0xc4c0_ca5e;
const MAX_HEADER_BYTES: usize = 1 << 20;
const MAX_ITEMS: usize = 5_000_000;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeCorpusHeader {
    pub version: String,
    pub source: String,
    pub key_alphabet: String,
    pub mass: f64,
    pub pinyin_count: usize,
    pub extension_maps: HashMap<String, BinaryExtension>,
    pub source_hashes: HashMap<String, String>,
    pub counts: NativeCorpusCounts,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
pub struct NativeCorpusCounts {
    pub character: usize,
    pub word2: usize,
    pub word3: usize,
    pub word4: usize,
}

#[derive(Clone, Debug)]
struct CharacterTemplate {
    id: String,
    py: u16,
    tone: u8,
    weight: f64,
    shape: [u8; 2],
    stroke_mask: u8,
}

#[derive(Clone, Debug)]
struct WordTemplate<const N: usize> {
    py: [u16; N],
    tones: [u8; N],
    weight: f64,
    shape: [u8; 2],
}

#[derive(Clone, Debug)]
pub struct NativeCorpus {
    header: NativeCorpusHeader,
    alphabet: KeyAlphabet,
    characters: Vec<CharacterTemplate>,
    word2: Vec<WordTemplate<2>>,
    word3: Vec<WordTemplate<3>>,
    word4: Vec<WordTemplate<4>>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InputMode {
    Keytao,
    Sanpin,
}

impl InputMode {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "keytao" => Ok(Self::Keytao),
            "sanpin" => Ok(Self::Sanpin),
            _ => Err(format!("unknown input mode {value:?}")),
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemeFixture {
    pub version: String,
    pub key_alphabet: String,
    pub source_hashes: HashMap<String, String>,
    pub schemes: Vec<SchemeInput>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemeInput {
    pub id: String,
    pub capacity: [u8; 2],
    pub tone: String,
    pub code_list: Vec<Option<String>>,
}

#[derive(Clone, Debug)]
pub struct SchemeState {
    pub id: String,
    pub capacity: [u8; 2],
    pub contract: Contract,
    codes: Vec<Option<[u8; 2]>>,
    tone: [u8; 5],
}

#[derive(Clone, Debug)]
pub struct DependencyIndex {
    pub by_pinyin: Vec<Vec<usize>>,
    pub by_tone_slot: [Vec<usize>; 5],
    row_count: usize,
    sources: Vec<RowSource>,
}

#[derive(Debug)]
pub struct GeneratedRows {
    pub rows: Vec<Row>,
    pub dependencies: DependencyIndex,
}

#[derive(Clone, Copy, Debug)]
enum RowSource {
    Character(usize),
    Word2(usize),
    Word3(usize),
    Word4(usize),
}

struct GeneratedTemplate {
    row: Row,
    pinyin: Vec<u16>,
    tone_slots: Vec<u8>,
}

impl SchemeFixture {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, String> {
        let text = std::fs::read_to_string(path).map_err(|error| error.to_string())?;
        let fixture: Self = serde_json::from_str(&text).map_err(|error| error.to_string())?;
        if fixture.version != "ckt-v4-scheme-state-1" {
            return Err(format!(
                "unsupported scheme fixture version {}",
                fixture.version
            ));
        }
        Ok(fixture)
    }
}

impl SchemeState {
    pub fn compile(
        input: &SchemeInput,
        alphabet: &KeyAlphabet,
        pinyin_count: usize,
    ) -> Result<Self, String> {
        if input.code_list.len() != pinyin_count {
            return Err(format!(
                "{} has {} codes, expected {pinyin_count}",
                input.id,
                input.code_list.len()
            ));
        }
        let mut codes = Vec::with_capacity(input.code_list.len());
        for code in &input.code_list {
            let Some(code) = code else {
                codes.push(None);
                continue;
            };
            let indices: Vec<_> = alphabet.pack(code)?.indices().collect();
            let pair: [u8; 2] = indices
                .try_into()
                .map_err(|_| format!("{} contains a non-two-key pinyin code {code:?}", input.id))?;
            codes.push(Some(pair));
        }
        let tone_values: Vec<_> = input
            .tone
            .chars()
            .map(|key| {
                alphabet
                    .index_of(key)
                    .ok_or_else(|| format!("{} has an unknown tone key {key:?}", input.id))
            })
            .collect::<Result<_, _>>()?;
        let tone: [u8; 5] = tone_values
            .try_into()
            .map_err(|_| format!("{} must have exactly five tone/shape keys", input.id))?;
        let contract = if input.capacity == [21, 21] {
            Contract::Traditional21x21
        } else {
            Contract::FourCodeTop
        };
        Ok(Self {
            id: input.id.clone(),
            capacity: input.capacity,
            contract,
            codes,
            tone,
        })
    }

    pub fn swap_pinyin_codes(&mut self, left: usize, right: usize) -> Result<(), String> {
        if left >= self.codes.len() || right >= self.codes.len() {
            return Err("pinyin swap index is outside the scheme".to_owned());
        }
        self.codes.swap(left, right);
        Ok(())
    }

    pub fn swap_tone_slots(&mut self, left: usize, right: usize) -> Result<(), String> {
        if left >= self.tone.len() || right >= self.tone.len() {
            return Err("tone swap index is outside the five-slot scheme".to_owned());
        }
        self.tone.swap(left, right);
        Ok(())
    }
}

impl DependencyIndex {
    pub fn affected_rows(
        &self,
        old: &SchemeState,
        new: &SchemeState,
    ) -> Result<Vec<usize>, String> {
        if old.codes.len() != new.codes.len()
            || old.capacity != new.capacity
            || old.contract != new.contract
        {
            return Err(
                "incremental updates require an unchanged scheme topology and capacity".to_owned(),
            );
        }
        if old
            .codes
            .iter()
            .zip(&new.codes)
            .any(|(left, right)| left.is_some() != right.is_some())
        {
            return Err("incremental updates cannot add or remove pinyin codes".to_owned());
        }
        let mut affected = BTreeSet::new();
        for (index, (left, right)) in old.codes.iter().zip(&new.codes).enumerate() {
            if left != right {
                affected.extend(&self.by_pinyin[index]);
            }
        }
        for slot in 0..5 {
            if old.tone[slot] != new.tone[slot] {
                affected.extend(&self.by_tone_slot[slot]);
            }
        }
        Ok(affected.into_iter().collect())
    }

    pub fn row_count(&self) -> usize {
        self.row_count
    }
}

impl NativeCorpus {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, String> {
        let file = File::open(path).map_err(|error| error.to_string())?;
        Self::read(BufReader::new(file))
    }

    pub fn header(&self) -> &NativeCorpusHeader {
        &self.header
    }

    pub fn generate(&self, scheme: &SchemeState, mode: InputMode) -> Result<GeneratedRows, String> {
        if scheme.codes.len() != self.header.pinyin_count {
            return Err("scheme/corpus pinyin count mismatch".to_owned());
        }
        let capacity =
            self.characters.len() + self.word2.len() + self.word3.len() + self.word4.len();
        let mut rows = Vec::with_capacity(capacity);
        let mut dependencies = DependencyIndex {
            by_pinyin: vec![Vec::new(); self.header.pinyin_count],
            by_tone_slot: std::array::from_fn(|_| Vec::new()),
            row_count: 0,
            sources: Vec::with_capacity(capacity),
        };
        let sources = (0..self.characters.len())
            .map(RowSource::Character)
            .chain((0..self.word2.len()).map(RowSource::Word2))
            .chain((0..self.word3.len()).map(RowSource::Word3))
            .chain((0..self.word4.len()).map(RowSource::Word4));
        for source in sources {
            if let Some(generated) = self.generate_source(scheme, mode, source)? {
                push_row(&mut rows, &mut dependencies, source, generated);
            }
        }
        dependencies.row_count = rows.len();
        Ok(GeneratedRows { rows, dependencies })
    }

    pub fn generate_updates(
        &self,
        scheme: &SchemeState,
        mode: InputMode,
        dependencies: &DependencyIndex,
        indices: &[usize],
    ) -> Result<Vec<(usize, Row)>, String> {
        if dependencies.sources.len() != dependencies.row_count {
            return Err("dependency source map is incomplete".to_owned());
        }
        let mut seen = BTreeSet::new();
        let mut updates = Vec::with_capacity(indices.len());
        for &index in indices {
            if index >= dependencies.row_count || !seen.insert(index) {
                return Err(format!("invalid or duplicate native update row {index}"));
            }
            let source = dependencies.sources[index];
            let generated = self
                .generate_source(scheme, mode, source)?
                .ok_or_else(|| "incremental update changed the row topology".to_owned())?;
            updates.push((index, generated.row));
        }
        Ok(updates)
    }

    fn generate_source(
        &self,
        scheme: &SchemeState,
        mode: InputMode,
        source: RowSource,
    ) -> Result<Option<GeneratedTemplate>, String> {
        match source {
            RowSource::Character(index) => self.generate_character(index, scheme, mode),
            RowSource::Word2(index) => self.generate_word2(index, scheme, mode),
            RowSource::Word3(index) => {
                self.generate_long_word(&self.word3[index], index, Kind::Word3, scheme, mode)
            }
            RowSource::Word4(index) => {
                self.generate_long_word(&self.word4[index], index, Kind::Word4, scheme, mode)
            }
        }
    }

    fn generate_character(
        &self,
        index: usize,
        scheme: &SchemeState,
        mode: InputMode,
    ) -> Result<Option<GeneratedTemplate>, String> {
        let item = &self.characters[index];
        let Some(base) = scheme.code(usize::from(item.py)) else {
            return Ok(None);
        };
        let mut tone_slots = Vec::new();
        let stages = match mode {
            InputMode::Keytao => {
                if item.shape.contains(&u8::MAX) {
                    return Ok(None);
                }
                tone_slots.extend(item.shape);
                let first = scheme.tone[usize::from(item.shape[0])];
                let second = scheme.tone[usize::from(item.shape[1])];
                make_stages(
                    &self.alphabet,
                    scheme.contract,
                    Kind::Character,
                    vec![
                        base.to_vec(),
                        append(base, &[first]),
                        append(base, &[first, second]),
                    ],
                )?
            }
            InputMode::Sanpin => {
                let tone_slot = usize::from(item.tone.saturating_sub(1));
                if tone_slot >= 5 || item.stroke_mask == 0 {
                    return Ok(None);
                }
                tone_slots.push(tone_slot as u8);
                let tone_key = scheme.tone[tone_slot];
                let mut terminal = Vec::new();
                for slot in 0..5 {
                    if item.stroke_mask & (1 << slot) != 0 {
                        tone_slots.push(slot as u8);
                        terminal.push(append(base, &[tone_key, scheme.tone[slot]]));
                    }
                }
                make_stages_multi(
                    &self.alphabet,
                    scheme.contract,
                    Kind::Character,
                    vec![
                        vec![base.to_vec()],
                        vec![append(base, &[tone_key])],
                        terminal,
                    ],
                )?
            }
        };
        Ok(Some(GeneratedTemplate {
            row: Row {
                id: item.id.clone(),
                text: String::new(),
                kind: Kind::Character,
                weight: item.weight,
                base_length: 2,
                stages,
            },
            pinyin: vec![item.py],
            tone_slots,
        }))
    }

    fn generate_word2(
        &self,
        index: usize,
        scheme: &SchemeState,
        mode: InputMode,
    ) -> Result<Option<GeneratedTemplate>, String> {
        let item = &self.word2[index];
        let Some(base) = scheme.word_base(&item.py) else {
            return Ok(None);
        };
        let slots = match mode {
            InputMode::Keytao if scheme.contract == Contract::Traditional21x21 => item.shape,
            InputMode::Keytao => [item.shape[1], item.shape[0]],
            InputMode::Sanpin => [item.tones[1] - 1, item.tones[0] - 1],
        };
        if slots.contains(&u8::MAX) {
            return Ok(None);
        }
        let first = scheme.tone[usize::from(slots[0])];
        let second = scheme.tone[usize::from(slots[1])];
        let stages = make_stages(
            &self.alphabet,
            scheme.contract,
            Kind::Word2,
            vec![
                base.clone(),
                append(&base, &[first]),
                append(&base, &[first, second]),
            ],
        )?;
        Ok(Some(GeneratedTemplate {
            row: Row {
                id: format!("w2:{index}"),
                text: String::new(),
                kind: Kind::Word2,
                weight: item.weight,
                base_length: 4,
                stages,
            },
            pinyin: item.py.to_vec(),
            tone_slots: slots.to_vec(),
        }))
    }

    fn generate_long_word<const N: usize>(
        &self,
        item: &WordTemplate<N>,
        index: usize,
        kind: Kind,
        scheme: &SchemeState,
        mode: InputMode,
    ) -> Result<Option<GeneratedTemplate>, String> {
        let Some(codes) = scheme.word_codes(&item.py) else {
            return Ok(None);
        };
        let mut stem: Vec<u8> = codes.iter().map(|code| code[0]).collect();
        let slots = match mode {
            InputMode::Keytao => item.shape,
            InputMode::Sanpin if scheme.contract == Contract::Traditional21x21 => {
                [item.tones[N - 1] - 1, item.tones[0] - 1]
            }
            InputMode::Sanpin => [item.tones[0] - 1, item.tones[1] - 1],
        };
        if slots.contains(&u8::MAX) {
            return Ok(None);
        }
        let first = scheme.tone[usize::from(slots[0])];
        let second = scheme.tone[usize::from(slots[1])];
        let (paths, base_length) =
            if kind == Kind::Word3 && scheme.contract == Contract::FourCodeTop {
                let mut routed = stem.clone();
                routed.push(codes[2][1]);
                (
                    vec![
                        stem,
                        routed.clone(),
                        append(&routed, &[first]),
                        append(&routed, &[first, second]),
                    ],
                    4,
                )
            } else {
                let with_first = append(&stem, &[first]);
                let with_second = append(&stem, &[first, second]);
                (
                    vec![std::mem::take(&mut stem), with_first, with_second],
                    N as u8,
                )
            };
        let stages = make_stages(&self.alphabet, scheme.contract, kind, paths)?;
        let prefix = if kind == Kind::Word3 {
            "word3"
        } else {
            "word4"
        };
        Ok(Some(GeneratedTemplate {
            row: Row {
                id: format!("{prefix}:{index}"),
                text: String::new(),
                kind,
                weight: item.weight,
                base_length,
                stages,
            },
            pinyin: item.py.to_vec(),
            tone_slots: slots.to_vec(),
        }))
    }

    fn read<R: Read>(mut reader: R) -> Result<Self, String> {
        let mut magic = [0_u8; 8];
        reader
            .read_exact(&mut magic)
            .map_err(|error| error.to_string())?;
        if &magic != MAGIC {
            return Err("not a CKT v4 native corpus".to_owned());
        }
        if read_u16(&mut reader)? != FORMAT_VERSION {
            return Err("unsupported native corpus format version".to_owned());
        }
        if read_u16(&mut reader)? != 0 {
            return Err("unsupported native corpus flags".to_owned());
        }
        let header_len = read_u32(&mut reader)? as usize;
        if header_len == 0 || header_len > MAX_HEADER_BYTES {
            return Err("invalid native corpus header length".to_owned());
        }
        let mut bytes = vec![0_u8; header_len];
        reader
            .read_exact(&mut bytes)
            .map_err(|error| error.to_string())?;
        let header: NativeCorpusHeader =
            serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
        if header.version != "ckt-v4-native-corpus-1" {
            return Err(format!(
                "unsupported native corpus metadata {}",
                header.version
            ));
        }
        let counts = NativeCorpusCounts {
            character: read_count(&mut reader)?,
            word2: read_count(&mut reader)?,
            word3: read_count(&mut reader)?,
            word4: read_count(&mut reader)?,
        };
        if counts != header.counts {
            return Err("native corpus header/body counts differ".to_owned());
        }
        let mut characters = Vec::with_capacity(counts.character);
        for _ in 0..counts.character {
            characters.push(CharacterTemplate {
                id: read_string_u16(&mut reader)?,
                py: read_u16(&mut reader)?,
                tone: read_u8(&mut reader)?,
                weight: read_f64(&mut reader)?,
                shape: [read_u8(&mut reader)?, read_u8(&mut reader)?],
                stroke_mask: read_u8(&mut reader)?,
            });
        }
        let word2 = read_words(&mut reader, counts.word2)?;
        let word3 = read_words(&mut reader, counts.word3)?;
        let word4 = read_words(&mut reader, counts.word4)?;
        if read_u32(&mut reader)? != FILE_END {
            return Err("invalid native corpus end marker".to_owned());
        }
        let mut trailing = [0_u8; 1];
        if reader
            .read(&mut trailing)
            .map_err(|error| error.to_string())?
            != 0
        {
            return Err("native corpus has trailing bytes".to_owned());
        }
        if header.pinyin_count == 0 || header.pinyin_count > usize::from(u16::MAX) + 1 {
            return Err(format!(
                "invalid native corpus pinyin count {}",
                header.pinyin_count
            ));
        }
        for item in &characters {
            validate_template_fields(
                &[item.py],
                &[item.tone],
                item.weight,
                item.shape,
                header.pinyin_count,
            )?;
            if item.stroke_mask & !0x1f != 0 {
                return Err(format!("{} has an invalid stroke mask", item.id));
            }
        }
        for item in &word2 {
            validate_template_fields(
                &item.py,
                &item.tones,
                item.weight,
                item.shape,
                header.pinyin_count,
            )?;
        }
        for item in &word3 {
            validate_template_fields(
                &item.py,
                &item.tones,
                item.weight,
                item.shape,
                header.pinyin_count,
            )?;
        }
        for item in &word4 {
            validate_template_fields(
                &item.py,
                &item.tones,
                item.weight,
                item.shape,
                header.pinyin_count,
            )?;
        }
        let alphabet = KeyAlphabet::new(&header.key_alphabet)?;
        Ok(Self {
            header,
            alphabet,
            characters,
            word2,
            word3,
            word4,
        })
    }
}

impl SchemeState {
    fn code(&self, py: usize) -> Option<&[u8; 2]> {
        self.codes.get(py).and_then(Option::as_ref)
    }

    fn word_codes<const N: usize>(&self, pinyin: &[u16; N]) -> Option<[[u8; 2]; N]> {
        let mut result = [[0_u8; 2]; N];
        for (target, &py) in result.iter_mut().zip(pinyin) {
            *target = *self.code(usize::from(py))?;
        }
        Some(result)
    }

    fn word_base<const N: usize>(&self, pinyin: &[u16; N]) -> Option<Vec<u8>> {
        Some(self.word_codes(pinyin)?.into_iter().flatten().collect())
    }
}

fn push_row(
    rows: &mut Vec<Row>,
    dependencies: &mut DependencyIndex,
    source: RowSource,
    generated: GeneratedTemplate,
) {
    let index = rows.len();
    rows.push(generated.row);
    dependencies.sources.push(source);
    for py in generated.pinyin {
        dependencies.by_pinyin[usize::from(py)].push(index);
    }
    let unique: BTreeSet<_> = generated.tone_slots.into_iter().collect();
    for slot in unique {
        dependencies.by_tone_slot[usize::from(slot)].push(index);
    }
}

fn append(base: &[u8], suffix: &[u8]) -> Vec<u8> {
    let mut result = Vec::with_capacity(base.len() + suffix.len());
    result.extend_from_slice(base);
    result.extend_from_slice(suffix);
    result
}

fn make_stages(
    alphabet: &KeyAlphabet,
    contract: Contract,
    kind: Kind,
    paths: Vec<Vec<u8>>,
) -> Result<Vec<Stage>, String> {
    make_stages_multi(
        alphabet,
        contract,
        kind,
        paths.into_iter().map(|path| vec![path]).collect(),
    )
}

fn make_stages_multi(
    alphabet: &KeyAlphabet,
    contract: Contract,
    kind: Kind,
    paths: Vec<Vec<Vec<u8>>>,
) -> Result<Vec<Stage>, String> {
    let pools = stage_pools(contract, kind);
    if paths.len() != pools.len() {
        return Err(format!("{contract:?}/{kind:?} stage count mismatch"));
    }
    paths
        .into_iter()
        .zip(pools)
        .map(|(codes, &pool)| {
            let order = codes.first().map(Vec::len).ok_or("empty native stage")? as u8;
            let mut packed: Vec<_> = codes
                .into_iter()
                .map(|code| PackedCode::from_indices(&code))
                .collect::<Result<_, _>>()?;
            if packed.iter().any(|code| code.len() != usize::from(order)) {
                return Err("native stage code length mismatch".to_owned());
            }
            alphabet.sort_codes_js(&mut packed);
            packed.dedup();
            Ok(Stage {
                order,
                pool,
                codes: packed,
            })
        })
        .collect()
}

fn read_words<const N: usize, R: Read>(
    reader: &mut R,
    count: usize,
) -> Result<Vec<WordTemplate<N>>, String> {
    let mut result = Vec::with_capacity(count);
    for _ in 0..count {
        let mut py = [0_u16; N];
        for value in &mut py {
            *value = read_u16(reader)?;
        }
        let mut tones = [0_u8; N];
        for value in &mut tones {
            *value = read_u8(reader)?;
        }
        result.push(WordTemplate {
            py,
            tones,
            weight: read_f64(reader)?,
            shape: [read_u8(reader)?, read_u8(reader)?],
        });
    }
    Ok(result)
}

fn validate_template_fields(
    pinyin: &[u16],
    tones: &[u8],
    weight: f64,
    shape: [u8; 2],
    pinyin_count: usize,
) -> Result<(), String> {
    if pinyin
        .iter()
        .any(|&value| usize::from(value) >= pinyin_count)
    {
        return Err("native template has an invalid pinyin index".to_owned());
    }
    if tones.iter().any(|tone| !(1..=5).contains(tone)) {
        return Err("native template has an invalid tone".to_owned());
    }
    if !weight.is_finite() || weight <= 0.0 {
        return Err("native template has an invalid weight".to_owned());
    }
    if shape.iter().any(|slot| *slot > 4 && *slot != u8::MAX) {
        return Err("native template has an invalid shape slot".to_owned());
    }
    Ok(())
}

fn read_count<R: Read>(reader: &mut R) -> Result<usize, String> {
    let value = read_u32(reader)? as usize;
    if value > MAX_ITEMS {
        Err(format!("native corpus count is too large: {value}"))
    } else {
        Ok(value)
    }
}

fn read_exact<const N: usize, R: Read>(reader: &mut R) -> Result<[u8; N], String> {
    let mut bytes = [0_u8; N];
    reader
        .read_exact(&mut bytes)
        .map_err(|error| error.to_string())?;
    Ok(bytes)
}
fn read_u8<R: Read>(reader: &mut R) -> Result<u8, String> {
    Ok(read_exact::<1, _>(reader)?[0])
}
fn read_u16<R: Read>(reader: &mut R) -> Result<u16, String> {
    Ok(u16::from_le_bytes(read_exact(reader)?))
}
fn read_u32<R: Read>(reader: &mut R) -> Result<u32, String> {
    Ok(u32::from_le_bytes(read_exact(reader)?))
}
fn read_f64<R: Read>(reader: &mut R) -> Result<f64, String> {
    Ok(f64::from_le_bytes(read_exact(reader)?))
}
fn read_string_u16<R: Read>(reader: &mut R) -> Result<String, String> {
    let len = read_u16(reader)? as usize;
    let mut bytes = vec![0_u8; len];
    reader
        .read_exact(&mut bytes)
        .map_err(|error| error.to_string())?;
    String::from_utf8(bytes).map_err(|error| error.to_string())
}
