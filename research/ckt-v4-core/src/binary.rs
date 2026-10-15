use crate::{
    CognitiveParameters, Contract, Kind, PackedCode, Pool, Row, Stage, TrackSummary, stage_pools,
};
use serde::Deserialize;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

const MAGIC: &[u8; 8] = b"CKTV4ROW";
const FORMAT_VERSION: u16 = 1;
const CASE_END: u32 = 0xc4e0_ca5e;
const MAX_HEADER_BYTES: usize = 1 << 20;
const MAX_ROWS_PER_CASE: usize = 5_000_000;
const MAX_ID_BYTES: usize = 1 << 20;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BinaryHeader {
    pub version: String,
    pub source: String,
    pub key_alphabet: String,
    pub cognitive_parameters: CognitiveParameters,
    pub extension_maps: HashMap<String, BinaryExtension>,
    pub corpus: BinaryCorpus,
    pub source_hashes: HashMap<String, String>,
    pub case_count: usize,
}

#[derive(Clone, Debug, Deserialize)]
pub struct BinaryExtension {
    pub donors: HashMap<String, f64>,
    #[serde(alias = "distanceGuardMultiplier")]
    pub distance_guard_multiplier: f64,
}

#[derive(Clone, Debug, Deserialize)]
pub struct BinaryCorpus {
    pub mass: f64,
    pub word2: usize,
    pub word3: usize,
    pub word4: usize,
}

#[derive(Debug)]
pub struct BinaryCase {
    pub scheme_id: String,
    pub capacity: [u8; 2],
    pub contract: Contract,
    pub mode: String,
    pub rows: Vec<Row>,
    pub expected_summary: [TrackSummary; 4],
}

pub struct BinaryFixture<R> {
    reader: R,
    header: BinaryHeader,
    remaining: usize,
    eof_checked: bool,
}

impl BinaryFixture<BufReader<File>> {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, String> {
        let file = File::open(path).map_err(|error| error.to_string())?;
        Self::new(BufReader::new(file))
    }
}

impl<R: Read> BinaryFixture<R> {
    pub fn new(mut reader: R) -> Result<Self, String> {
        let mut magic = [0_u8; 8];
        reader
            .read_exact(&mut magic)
            .map_err(|error| error.to_string())?;
        if &magic != MAGIC {
            return Err("not a CKT v4 row fixture".to_owned());
        }
        let version = read_u16(&mut reader)?;
        if version != FORMAT_VERSION {
            return Err(format!("unsupported binary fixture version {version}"));
        }
        let flags = read_u16(&mut reader)?;
        if flags != 0 {
            return Err(format!("unsupported binary fixture flags {flags:#x}"));
        }
        let header_len = read_u32(&mut reader)? as usize;
        if header_len == 0 || header_len > MAX_HEADER_BYTES {
            return Err(format!("invalid binary fixture header length {header_len}"));
        }
        let mut bytes = vec![0_u8; header_len];
        reader
            .read_exact(&mut bytes)
            .map_err(|error| error.to_string())?;
        let header: BinaryHeader =
            serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
        if header.version != "ckt-v4-row-binary-1" {
            return Err(format!("unsupported metadata version {}", header.version));
        }
        if header.case_count == 0 {
            return Err("binary fixture contains no cases".to_owned());
        }
        let remaining = header.case_count;
        Ok(Self {
            reader,
            header,
            remaining,
            eof_checked: false,
        })
    }

    pub fn header(&self) -> &BinaryHeader {
        &self.header
    }

    pub fn next_case(&mut self) -> Result<Option<BinaryCase>, String> {
        if self.remaining == 0 {
            if !self.eof_checked {
                let mut trailing = [0_u8; 1];
                if self
                    .reader
                    .read(&mut trailing)
                    .map_err(|error| error.to_string())?
                    != 0
                {
                    return Err("binary fixture has trailing bytes".to_owned());
                }
                self.eof_checked = true;
            }
            return Ok(None);
        }
        let scheme_id = read_string_u16(&mut self.reader)?;
        let capacity = [read_u8(&mut self.reader)?, read_u8(&mut self.reader)?];
        let contract = match read_u8(&mut self.reader)? {
            0 => Contract::Traditional21x21,
            1 => Contract::FourCodeTop,
            value => return Err(format!("unknown contract id {value}")),
        };
        let expected_contract = if capacity == [21, 21] {
            Contract::Traditional21x21
        } else {
            Contract::FourCodeTop
        };
        if contract != expected_contract {
            return Err(format!(
                "{scheme_id} declares {contract:?} for {}x{}",
                capacity[0], capacity[1]
            ));
        }
        let mode = match read_u8(&mut self.reader)? {
            0 => "keytao".to_owned(),
            1 => "sanpin".to_owned(),
            value => return Err(format!("unknown mode id {value}")),
        };
        let row_count = read_u32(&mut self.reader)? as usize;
        if row_count == 0 || row_count > MAX_ROWS_PER_CASE {
            return Err(format!(
                "{scheme_id}/{mode} has invalid row count {row_count}"
            ));
        }
        let expected_summary = [
            read_track(&mut self.reader)?,
            read_track(&mut self.reader)?,
            read_track(&mut self.reader)?,
            read_track(&mut self.reader)?,
        ];
        let mut rows = Vec::with_capacity(row_count);
        for _ in 0..row_count {
            rows.push(read_row(&mut self.reader)?);
        }
        for row in &rows {
            let expected = stage_pools(contract, row.kind);
            if row.stages.len() != expected.len()
                || row
                    .stages
                    .iter()
                    .zip(expected)
                    .any(|(stage, pool)| stage.pool != *pool)
            {
                return Err(format!(
                    "{scheme_id}/{mode}/{} violates the {contract:?} pool contract",
                    row.id
                ));
            }
        }
        let marker = read_u32(&mut self.reader)?;
        if marker != CASE_END {
            return Err(format!(
                "{scheme_id}/{mode} has invalid end marker {marker:#x}"
            ));
        }
        self.remaining -= 1;
        Ok(Some(BinaryCase {
            scheme_id,
            capacity,
            contract,
            mode,
            rows,
            expected_summary,
        }))
    }
}

fn read_row<R: Read>(reader: &mut R) -> Result<Row, String> {
    let id = read_string_u32(reader)?;
    let kind = match read_u8(reader)? {
        0 => Kind::Character,
        1 => Kind::Word2,
        2 => Kind::Word3,
        3 => Kind::Word4,
        value => return Err(format!("unknown row kind id {value}")),
    };
    let weight = read_f64(reader)?;
    let base_length = read_u8(reader)?;
    let stage_count = read_u8(reader)? as usize;
    if stage_count == 0 {
        return Err(format!("row {id:?} has no stages"));
    }
    let mut stages = Vec::with_capacity(stage_count);
    for _ in 0..stage_count {
        let order = read_u8(reader)?;
        let pool = pool_from_id(read_u8(reader)?)?;
        let code_count = read_u16(reader)? as usize;
        if code_count == 0 {
            return Err(format!("row {id:?} has an empty stage"));
        }
        let mut codes = Vec::with_capacity(code_count);
        for _ in 0..code_count {
            codes.push(PackedCode::from_bits_len(read_u64(reader)?, order)?);
        }
        stages.push(Stage { order, pool, codes });
    }
    Ok(Row {
        id,
        text: String::new(),
        kind,
        weight,
        base_length,
        stages,
    })
}

fn pool_from_id(value: u8) -> Result<Pool, String> {
    match value {
        0 => Ok(Pool::CharBase),
        1 => Ok(Pool::CharAux1),
        2 => Ok(Pool::CharAux2),
        3 => Ok(Pool::WordFour),
        4 => Ok(Pool::WordFive),
        5 => Ok(Pool::WordSix),
        6 => Ok(Pool::Word3Three),
        7 => Ok(Pool::Word3FourB),
        8 => Ok(Pool::Word3FiveBb),
        _ => Err(format!("unknown pool id {value}")),
    }
}

fn read_track<R: Read>(reader: &mut R) -> Result<TrackSummary, String> {
    Ok(TrackSummary {
        count: read_u32(reader)? as usize,
        total_weight: read_f64(reader)?,
        motor_upper_ms: read_f64(reader)?,
        cognitive_ms: read_f64(reader)?,
        effective_ms: read_f64(reader)?,
        first_aux_rate: read_f64(reader)?,
        second_aux_rate: read_f64(reader)?,
        selection_rate: read_f64(reader)?,
        mean_terminal_rank: read_f64(reader)?,
        mean_keys: read_f64(reader)?,
    })
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

fn read_u64<R: Read>(reader: &mut R) -> Result<u64, String> {
    Ok(u64::from_le_bytes(read_exact(reader)?))
}

fn read_f64<R: Read>(reader: &mut R) -> Result<f64, String> {
    Ok(f64::from_le_bytes(read_exact(reader)?))
}

fn read_string_u16<R: Read>(reader: &mut R) -> Result<String, String> {
    let len = read_u16(reader)? as usize;
    read_string(reader, len)
}

fn read_string_u32<R: Read>(reader: &mut R) -> Result<String, String> {
    let len = read_u32(reader)? as usize;
    if len > MAX_ID_BYTES {
        return Err(format!("row id is too large: {len} bytes"));
    }
    read_string(reader, len)
}

fn read_string<R: Read>(reader: &mut R, len: usize) -> Result<String, String> {
    let mut bytes = vec![0_u8; len];
    reader
        .read_exact(&mut bytes)
        .map_err(|error| error.to_string())?;
    String::from_utf8(bytes).map_err(|error| error.to_string())
}
