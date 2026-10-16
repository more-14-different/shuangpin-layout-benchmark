use crate::frontier::validate_ergonomic_metrics;
use crate::{ErgonomicMetricSchema, FrontierPoint, MetricDefinition};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::Path;

const LOG_VERSION: &str = "ckt-v4-frontier-log-2";

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontierLogProvenance {
    pub corpus_hash: String,
    pub scheme_hash: String,
    pub scheme_id: String,
    pub max_memory: Option<usize>,
    pub max_displaced_initials: Option<usize>,
    pub max_displaced_vowels: Option<usize>,
    pub proposal_policy: String,
    pub ergonomic_schema: ErgonomicMetricSchema,
    pub ergonomic_contract: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct LogHeader {
    version: String,
    kind: String,
    provenance: FrontierLogProvenance,
    metric_schema: Vec<MetricDefinition>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LogRecord {
    kind: String,
    point: FrontierPoint,
}

#[derive(Debug)]
pub struct FrontierLogWriter {
    writer: BufWriter<File>,
    schema: ErgonomicMetricSchema,
}

#[derive(Clone, Debug, PartialEq)]
pub struct LogRecovery {
    pub provenance: FrontierLogProvenance,
    pub points: Vec<FrontierPoint>,
    pub input_records: usize,
    pub duplicate_records: usize,
    pub truncated_tail: bool,
}

impl FrontierLogWriter {
    pub fn open(path: impl AsRef<Path>, provenance: FrontierLogProvenance) -> Result<Self, String> {
        let path = path.as_ref();
        let schema = provenance.ergonomic_schema;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let exists = path.exists() && path.metadata().map_err(|error| error.to_string())?.len() > 0;
        if exists {
            let inspection = inspect_existing(path)?;
            if inspection.header.provenance != provenance {
                return Err("frontier log provenance mismatch".to_owned());
            }
            if let Some(length) = inspection.truncate_to {
                OpenOptions::new()
                    .write(true)
                    .open(path)
                    .and_then(|file| file.set_len(length))
                    .map_err(|error| error.to_string())?;
            }
        }
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .map_err(|error| error.to_string())?;
        let mut writer = BufWriter::new(file);
        if !exists {
            write_line(&mut writer, &header(provenance))?;
        }
        Ok(Self { writer, schema })
    }

    pub fn append(&mut self, point: &FrontierPoint) -> Result<(), String> {
        if !point.metrics.ckt_v4.is_finite()
            || validate_ergonomic_metrics(point.metrics, self.schema).is_err()
        {
            return Err("frontier log refuses non-finite metrics".to_owned());
        }
        write_line(
            &mut self.writer,
            &LogRecord {
                kind: "point".to_owned(),
                point: point.clone(),
            },
        )
    }

    pub const fn retained_history_len(&self) -> usize {
        0
    }
}

pub fn read_frontier_log(path: impl AsRef<Path>) -> Result<LogRecovery, String> {
    let file = File::open(path).map_err(|error| error.to_string())?;
    let mut reader = BufReader::new(file);
    let mut buffer = Vec::new();
    if reader
        .read_until(b'\n', &mut buffer)
        .map_err(|error| error.to_string())?
        == 0
        || !buffer.ends_with(b"\n")
    {
        return Err("frontier log has no complete header".to_owned());
    }
    let header: LogHeader = serde_json::from_slice(trim_newline(&buffer))
        .map_err(|error| format!("invalid frontier log header: {error}"))?;
    validate_header(&header)?;

    let mut points = Vec::new();
    let mut seen = BTreeSet::new();
    let mut input_records = 0;
    let mut duplicate_records = 0;
    let mut truncated_tail = false;
    loop {
        buffer.clear();
        let count = reader
            .read_until(b'\n', &mut buffer)
            .map_err(|error| error.to_string())?;
        if count == 0 {
            break;
        }
        if !buffer.ends_with(b"\n") {
            truncated_tail = true;
            break;
        }
        let record: LogRecord = serde_json::from_slice(trim_newline(&buffer))
            .map_err(|error| format!("corrupt completed frontier record: {error}"))?;
        if record.kind != "point"
            || !record.point.metrics.ckt_v4.is_finite()
            || validate_ergonomic_metrics(record.point.metrics, header.provenance.ergonomic_schema)
                .is_err()
        {
            return Err("invalid completed frontier record".to_owned());
        }
        input_records += 1;
        let key = serde_json::to_vec(&record.point).map_err(|error| error.to_string())?;
        if seen.insert(key) {
            points.push(record.point);
        } else {
            duplicate_records += 1;
        }
    }
    Ok(LogRecovery {
        provenance: header.provenance,
        points,
        input_records,
        duplicate_records,
        truncated_tail,
    })
}

struct Inspection {
    header: LogHeader,
    truncate_to: Option<u64>,
}

fn inspect_existing(path: &Path) -> Result<Inspection, String> {
    let file = File::open(path).map_err(|error| error.to_string())?;
    let mut reader = BufReader::new(file);
    let mut buffer = Vec::new();
    let mut offset = 0_u64;
    let count = reader
        .read_until(b'\n', &mut buffer)
        .map_err(|error| error.to_string())?;
    if count == 0 || !buffer.ends_with(b"\n") {
        return Err("frontier log has no complete header".to_owned());
    }
    offset += count as u64;
    let header: LogHeader = serde_json::from_slice(trim_newline(&buffer))
        .map_err(|error| format!("invalid frontier log header: {error}"))?;
    validate_header(&header)?;
    let mut truncate_to = None;
    loop {
        buffer.clear();
        let count = reader
            .read_until(b'\n', &mut buffer)
            .map_err(|error| error.to_string())?;
        if count == 0 {
            break;
        }
        if !buffer.ends_with(b"\n") {
            truncate_to = Some(offset);
            break;
        }
        let record: LogRecord = serde_json::from_slice(trim_newline(&buffer))
            .map_err(|error| format!("corrupt completed frontier record: {error}"))?;
        if record.kind != "point"
            || !record.point.metrics.ckt_v4.is_finite()
            || validate_ergonomic_metrics(record.point.metrics, header.provenance.ergonomic_schema)
                .is_err()
        {
            return Err("invalid completed frontier record".to_owned());
        }
        offset += count as u64;
    }
    Ok(Inspection {
        header,
        truncate_to,
    })
}

fn header(provenance: FrontierLogProvenance) -> LogHeader {
    let metric_schema = provenance.ergonomic_schema.declarations();
    LogHeader {
        version: LOG_VERSION.to_owned(),
        kind: "header".to_owned(),
        provenance,
        metric_schema,
    }
}

fn validate_header(header: &LogHeader) -> Result<(), String> {
    if header.version != LOG_VERSION
        || header.kind != "header"
        || header.metric_schema != header.provenance.ergonomic_schema.declarations()
    {
        return Err("unsupported frontier log header".to_owned());
    }
    Ok(())
}

fn write_line(writer: &mut BufWriter<File>, value: &impl Serialize) -> Result<(), String> {
    serde_json::to_writer(&mut *writer, value).map_err(|error| error.to_string())?;
    writer.write_all(b"\n").map_err(|error| error.to_string())?;
    writer.flush().map_err(|error| error.to_string())
}

fn trim_newline(bytes: &[u8]) -> &[u8] {
    let bytes = bytes.strip_suffix(b"\n").unwrap_or(bytes);
    bytes.strip_suffix(b"\r").unwrap_or(bytes)
}
