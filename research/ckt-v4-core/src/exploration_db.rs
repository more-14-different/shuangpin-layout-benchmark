use crate::explorer::{coverage_cell, layout_state_bytes};
use crate::{
    ErgonomicFrontierMetrics, ErgonomicMetricSchema, ExplorationBatch, ExplorationConfig,
    ExplorationEntry, ExplorationPlan, FrontierLogProvenance, FrontierMetrics, FrontierPoint,
    RegularLayout, ReviewCandidate, SeedRecommendation,
};
use rusqlite::{Connection, OpenFlags, OptionalExtension, Transaction, params};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

pub const EXPLORATION_DATABASE_VERSION: &str = "ckt-v4-exploration-db-1";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DatabaseMetadata {
    version: String,
    generation: usize,
    capacity: [u8; 2],
    corpus_hash: String,
    scheme_hash: String,
    max_memory: Option<usize>,
    max_displaced_initials: Option<usize>,
    max_displaced_vowels: Option<usize>,
    proposal_policy: String,
    ergonomic_schema: ErgonomicMetricSchema,
    ergonomic_contract: Option<String>,
    index_radius: usize,
}

#[derive(Clone, Copy, Debug)]
struct DistanceEstimate {
    distance: Option<usize>,
    exact: bool,
}

pub struct ExplorationDatabase {
    connection: Connection,
}

pub struct ExplorationStateLookup {
    connection: Connection,
    generation: usize,
    capacity: [u8; 2],
    scheme_hash: String,
}

impl ExplorationDatabase {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, String> {
        if let Some(parent) = path.as_ref().parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let connection = Connection::open(path).map_err(db_error)?;
        connection
            .execute_batch(
                "PRAGMA journal_mode = WAL;
                 PRAGMA synchronous = FULL;
                 PRAGMA foreign_keys = ON;
                 PRAGMA busy_timeout = 30000;
                 CREATE TABLE IF NOT EXISTS archive_meta (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    metadata_json TEXT NOT NULL
                 );
                 CREATE TABLE IF NOT EXISTS states (
                    state_id INTEGER PRIMARY KEY,
                    state_key BLOB NOT NULL UNIQUE,
                    layout_id TEXT NOT NULL,
                    iteration INTEGER NOT NULL,
                    ckt_v4 REAL NOT NULL,
                    memory INTEGER NOT NULL,
                    displaced_initials INTEGER NOT NULL,
                    displaced_vowels INTEGER NOT NULL,
                    ergonomics_json TEXT,
                    rp_max REAL,
                    home_floor REAL,
                    mx_score REAL,
                    first_seen_generation INTEGER NOT NULL,
                    last_seen_generation INTEGER NOT NULL,
                    evaluations INTEGER NOT NULL,
                    last_seeded_generation INTEGER,
                    coverage_cell TEXT NOT NULL
                 );
                 CREATE INDEX IF NOT EXISTS states_ckt ON states(ckt_v4, state_key);
                 CREATE INDEX IF NOT EXISTS states_fresh ON states(first_seen_generation, ckt_v4);
                 CREATE INDEX IF NOT EXISTS states_coverage ON states(coverage_cell);
                 CREATE INDEX IF NOT EXISTS states_rp ON states(rp_max, ckt_v4);
                 CREATE INDEX IF NOT EXISTS states_home ON states(home_floor DESC, ckt_v4);
                 CREATE INDEX IF NOT EXISTS states_mx ON states(mx_score DESC, ckt_v4);
                 CREATE INDEX IF NOT EXISTS states_memory ON states(memory, ckt_v4);
                 CREATE TABLE IF NOT EXISTS state_bands (
                    band_id INTEGER NOT NULL,
                    signature BLOB NOT NULL,
                    state_id INTEGER NOT NULL REFERENCES states(state_id) ON DELETE CASCADE,
                    PRIMARY KEY (band_id, signature, state_id)
                 ) WITHOUT ROWID;
                 CREATE TABLE IF NOT EXISTS sources (
                    source_id INTEGER PRIMARY KEY,
                    source TEXT NOT NULL UNIQUE
                 );
                 CREATE TABLE IF NOT EXISTS state_sources (
                    state_id INTEGER NOT NULL REFERENCES states(state_id) ON DELETE CASCADE,
                    source_id INTEGER NOT NULL REFERENCES sources(source_id) ON DELETE CASCADE,
                    PRIMARY KEY (state_id, source_id)
                 ) WITHOUT ROWID;
                 CREATE TABLE IF NOT EXISTS generations (
                    generation INTEGER PRIMARY KEY,
                    request_signature TEXT NOT NULL,
                    plan_json TEXT NOT NULL
                 );",
            )
            .map_err(db_error)?;
        Ok(Self { connection })
    }

    pub fn plan_generation(
        &mut self,
        batches: Vec<ExplorationBatch>,
        generation: usize,
        config: ExplorationConfig,
        request_signature: &str,
    ) -> Result<ExplorationPlan, String> {
        validate_config(config)?;
        if let Some((saved_signature, plan_json)) = self
            .connection
            .query_row(
                "SELECT request_signature, plan_json FROM generations WHERE generation = ?1",
                [to_i64(generation)?],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(db_error)?
        {
            if saved_signature != request_signature {
                return Err(format!(
                    "generation {generation} was already committed with different inputs"
                ));
            }
            return serde_json::from_str(&plan_json).map_err(|error| error.to_string());
        }
        if batches.is_empty() {
            return Err("exploration planning requires at least one log".to_owned());
        }
        let transaction = self.connection.transaction().map_err(db_error)?;
        let mut metadata = ensure_metadata(&transaction, &batches, config)?;
        if generation != metadata.generation + 1 {
            return Err(format!(
                "generation {generation} must immediately follow database generation {}",
                metadata.generation
            ));
        }
        let prior_generation = metadata.generation;
        let prior_count = count_states_through(&transaction, prior_generation)?;
        let imported_new_states = import_batches(&transaction, &metadata, &batches, generation)?;
        let total_states = count_all_states(&transaction)?;
        let best_ckt_v4: f64 = transaction
            .query_row("SELECT MIN(ckt_v4) FROM states", [], |row| row.get(0))
            .map_err(db_error)?;
        let threshold = best_ckt_v4 + config.max_ckt_delta;

        let fresh_entries = query_fresh_entries(&transaction, generation, threshold)?;
        let mut candidates: BTreeMap<Vec<u8>, ExplorationEntry> = fresh_entries
            .iter()
            .cloned()
            .map(|entry| (state_bytes_from_entry(&entry), entry))
            .collect();
        let pool_limit = config.seed_count.saturating_mul(64).max(256);
        for (filter, order) in [
            ("1", "ckt_v4 ASC"),
            ("rp_max IS NOT NULL", "rp_max ASC, ckt_v4 ASC"),
            ("home_floor IS NOT NULL", "home_floor DESC, ckt_v4 ASC"),
            ("mx_score IS NOT NULL", "mx_score DESC, ckt_v4 ASC"),
            ("1", "memory ASC, ckt_v4 ASC"),
        ] {
            for entry in query_candidate_slice(&transaction, threshold, pool_limit, filter, order)?
            {
                candidates
                    .entry(state_bytes_from_entry(&entry))
                    .or_insert(entry);
            }
        }
        let mut entries: Vec<_> = candidates.into_values().collect();
        entries.sort_by(candidate_order);
        let fresh_indices: Vec<_> = entries
            .iter()
            .enumerate()
            .filter(|(_, entry)| entry.first_seen_generation == generation)
            .map(|(index, _)| index)
            .collect();
        let eligible: Vec<_> = (0..entries.len()).collect();
        let mut coverage = BTreeMap::new();
        for entry in &entries {
            let cell = coverage_cell(&entry.point);
            if let std::collections::btree_map::Entry::Vacant(slot) = coverage.entry(cell) {
                let count = transaction
                    .query_row(
                        "SELECT COUNT(*) FROM states WHERE coverage_cell = ?1",
                        [slot.key()],
                        |row| row.get::<_, i64>(0),
                    )
                    .map_err(db_error)?;
                slot.insert(to_usize(count)?);
            }
        }
        let prior_distances = entries
            .iter()
            .map(|entry| {
                nearest_prior_distance(
                    &transaction,
                    &layout_state_bytes(&entry.point.layout),
                    prior_generation,
                    prior_count,
                    metadata.index_radius,
                )
            })
            .collect::<Result<Vec<_>, _>>()?;
        let selected = select_seeds(
            &entries,
            &eligible,
            &fresh_indices,
            &coverage,
            &prior_distances,
            generation,
            config.seed_count,
        )?;
        let mut seeds = Vec::with_capacity(selected.len());
        for (rank, (index, reason)) in selected.into_iter().enumerate() {
            let entry = &entries[index];
            let estimate = prior_distances[index];
            let cell = coverage_cell(&entry.point);
            seeds.push(SeedRecommendation {
                rank: rank + 1,
                reason,
                state_key: entry.state_key.clone(),
                nearest_prior_distance: estimate.distance,
                nearest_prior_distance_exact: estimate.exact,
                coverage_cell: cell.clone(),
                coverage_count: coverage[&cell],
                point: entry.point.clone(),
            });
            transaction
                .execute(
                    "UPDATE states SET last_seeded_generation = ?1 WHERE state_key = ?2",
                    params![to_i64(generation)?, state_bytes_from_entry(entry)],
                )
                .map_err(db_error)?;
        }
        let review_queue = review_candidates(
            &transaction,
            &fresh_entries,
            prior_generation,
            prior_count,
            best_ckt_v4,
            metadata.index_radius,
            config,
        )?;
        let plan = ExplorationPlan {
            version: crate::EXPLORATION_PLAN_VERSION.to_owned(),
            generation,
            imported_new_states,
            total_states,
            best_ckt_v4,
            seeds,
            review_queue,
        };
        metadata.generation = generation;
        transaction
            .execute(
                "UPDATE archive_meta SET metadata_json = ?1 WHERE id = 1",
                [serde_json::to_string(&metadata).map_err(|error| error.to_string())?],
            )
            .map_err(db_error)?;
        transaction
            .execute(
                "INSERT INTO generations(generation, request_signature, plan_json)
                 VALUES (?1, ?2, ?3)",
                params![
                    to_i64(generation)?,
                    request_signature,
                    serde_json::to_string(&plan).map_err(|error| error.to_string())?
                ],
            )
            .map_err(db_error)?;
        transaction.commit().map_err(db_error)?;
        Ok(plan)
    }
}

impl ExplorationStateLookup {
    pub fn open(
        path: impl AsRef<Path>,
        generation: usize,
        expected_scheme_hash: &str,
    ) -> Result<Self, String> {
        let connection = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(db_error)?;
        connection
            .execute_batch("PRAGMA query_only = ON; PRAGMA busy_timeout = 30000;")
            .map_err(db_error)?;
        let metadata =
            read_metadata(&connection)?.ok_or("exploration database has no archive metadata")?;
        if metadata.version != EXPLORATION_DATABASE_VERSION {
            return Err(format!(
                "unsupported exploration database version {}",
                metadata.version
            ));
        }
        if generation > metadata.generation {
            return Err(format!(
                "requested archive generation {generation} exceeds database generation {}",
                metadata.generation
            ));
        }
        if metadata.scheme_hash != expected_scheme_hash {
            return Err("exploration database scheme provenance differs".to_owned());
        }
        Ok(Self {
            connection,
            generation,
            capacity: metadata.capacity,
            scheme_hash: metadata.scheme_hash,
        })
    }

    pub const fn generation(&self) -> usize {
        self.generation
    }

    pub const fn capacity(&self) -> [u8; 2] {
        self.capacity
    }

    pub fn scheme_hash(&self) -> &str {
        &self.scheme_hash
    }

    pub fn contains(&self, layout: &RegularLayout) -> Result<bool, String> {
        if layout.capacity != self.capacity {
            return Err("layout capacity differs from exploration database".to_owned());
        }
        self.connection
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM states
                    WHERE state_key = ?1 AND first_seen_generation <= ?2
                 )",
                params![layout_state_bytes(layout), to_i64(self.generation)?],
                |row| row.get::<_, bool>(0),
            )
            .map_err(db_error)
    }
}

fn validate_config(config: ExplorationConfig) -> Result<(), String> {
    let radius = config.novelty_distance.max(config.basin_radius);
    if config.seed_count == 0
        || !config.max_ckt_delta.is_finite()
        || config.max_ckt_delta < 0.0
        || config.basin_support == 0
        || radius > 67
    {
        return Err("invalid exploration planner configuration".to_owned());
    }
    Ok(())
}

fn ensure_metadata(
    transaction: &Transaction<'_>,
    batches: &[ExplorationBatch],
    config: ExplorationConfig,
) -> Result<DatabaseMetadata, String> {
    if let Some(metadata) = read_metadata(transaction)? {
        if metadata.version != EXPLORATION_DATABASE_VERSION {
            return Err(format!(
                "unsupported exploration database version {}",
                metadata.version
            ));
        }
        if metadata.index_radius < config.novelty_distance.max(config.basin_radius) {
            return Err(format!(
                "database distance index radius {} is smaller than requested radius {}",
                metadata.index_radius,
                config.novelty_distance.max(config.basin_radius)
            ));
        }
        for batch in batches {
            validate_provenance(&metadata, &batch.provenance)?;
            if batch
                .points
                .iter()
                .any(|point| point.layout.capacity != metadata.capacity)
            {
                return Err("exploration log layout capacity differs from database".to_owned());
            }
        }
        return Ok(metadata);
    }
    let first_batch = batches.first().ok_or("no exploration log was provided")?;
    let first_point = batches
        .iter()
        .flat_map(|batch| &batch.points)
        .next()
        .ok_or("exploration logs contain no points")?;
    let metadata = DatabaseMetadata {
        version: EXPLORATION_DATABASE_VERSION.to_owned(),
        generation: 0,
        capacity: first_point.layout.capacity,
        corpus_hash: first_batch.provenance.corpus_hash.clone(),
        scheme_hash: first_batch.provenance.scheme_hash.clone(),
        max_memory: first_batch.provenance.max_memory,
        max_displaced_initials: first_batch.provenance.max_displaced_initials,
        max_displaced_vowels: first_batch.provenance.max_displaced_vowels,
        proposal_policy: first_batch.provenance.proposal_policy.clone(),
        ergonomic_schema: first_batch.provenance.ergonomic_schema,
        ergonomic_contract: first_batch.provenance.ergonomic_contract.clone(),
        index_radius: config.novelty_distance.max(config.basin_radius),
    };
    for batch in batches {
        validate_provenance(&metadata, &batch.provenance)?;
        if batch
            .points
            .iter()
            .any(|point| point.layout.capacity != metadata.capacity)
        {
            return Err("exploration log layout capacity differs from database".to_owned());
        }
    }
    transaction
        .execute(
            "INSERT INTO archive_meta(id, metadata_json) VALUES (1, ?1)",
            [serde_json::to_string(&metadata).map_err(|error| error.to_string())?],
        )
        .map_err(db_error)?;
    Ok(metadata)
}

fn read_metadata(connection: &Connection) -> Result<Option<DatabaseMetadata>, String> {
    let json = connection
        .query_row(
            "SELECT metadata_json FROM archive_meta WHERE id = 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(db_error)?;
    json.map(|value| serde_json::from_str(&value).map_err(|error| error.to_string()))
        .transpose()
}

fn validate_provenance(
    metadata: &DatabaseMetadata,
    provenance: &FrontierLogProvenance,
) -> Result<(), String> {
    if metadata.corpus_hash != provenance.corpus_hash
        || metadata.scheme_hash != provenance.scheme_hash
        || metadata.max_memory != provenance.max_memory
        || metadata.max_displaced_initials != provenance.max_displaced_initials
        || metadata.max_displaced_vowels != provenance.max_displaced_vowels
        || metadata.proposal_policy != provenance.proposal_policy
        || metadata.ergonomic_schema != provenance.ergonomic_schema
        || metadata.ergonomic_contract != provenance.ergonomic_contract
    {
        return Err("exploration log provenance/search contract differs from database".to_owned());
    }
    Ok(())
}

fn import_batches(
    transaction: &Transaction<'_>,
    metadata: &DatabaseMetadata,
    batches: &[ExplorationBatch],
    generation: usize,
) -> Result<usize, String> {
    let mut imported = 0;
    for batch in batches {
        transaction
            .execute(
                "INSERT OR IGNORE INTO sources(source) VALUES (?1)",
                [&batch.source],
            )
            .map_err(db_error)?;
        let source_id = transaction
            .query_row(
                "SELECT source_id FROM sources WHERE source = ?1",
                [&batch.source],
                |row| row.get::<_, i64>(0),
            )
            .map_err(db_error)?;
        for point in &batch.points {
            point.layout.validate_structure()?;
            if point.layout.capacity != metadata.capacity || !point.metrics.ckt_v4.is_finite() {
                return Err(format!("{} contains an incompatible point", batch.source));
            }
            let key = layout_state_bytes(&point.layout);
            let existing = transaction
                .query_row(
                    "SELECT state_id, ckt_v4 FROM states WHERE state_key = ?1",
                    [&key],
                    |row| Ok((row.get::<_, i64>(0)?, row.get::<_, f64>(1)?)),
                )
                .optional()
                .map_err(db_error)?;
            let state_id = if let Some((state_id, score)) = existing {
                if (score - point.metrics.ckt_v4).abs() > 1e-8 {
                    return Err(format!(
                        "state {} has inconsistent CKT v4 scores",
                        hex_key(&key)
                    ));
                }
                transaction
                    .execute(
                        "UPDATE states
                         SET last_seen_generation = ?1, evaluations = evaluations + 1
                         WHERE state_id = ?2",
                        params![to_i64(generation)?, state_id],
                    )
                    .map_err(db_error)?;
                state_id
            } else {
                let ergonomics_json = point
                    .metrics
                    .ergonomics
                    .map(|value| serde_json::to_string(&value))
                    .transpose()
                    .map_err(|error| error.to_string())?;
                let rp_max = point.metrics.ergonomics.map(|value| value.loads.rp_max);
                let home_floor = point.metrics.ergonomics.map(|value| value.loads.home_floor);
                let mx_score = point.metrics.ergonomics.and_then(|value| value.mx_score);
                transaction
                    .execute(
                        "INSERT INTO states(
                            state_key, layout_id, iteration, ckt_v4, memory,
                            displaced_initials, displaced_vowels, ergonomics_json,
                            rp_max, home_floor, mx_score, first_seen_generation,
                            last_seen_generation, evaluations, last_seeded_generation,
                            coverage_cell
                         ) VALUES (
                            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11,
                            ?12, ?12, 1, NULL, ?13
                         )",
                        params![
                            &key,
                            &point.layout.id,
                            to_i64(point.iteration)?,
                            point.metrics.ckt_v4,
                            to_i64(point.metrics.memory)?,
                            to_i64(point.metrics.displaced_initials)?,
                            to_i64(point.metrics.displaced_vowels)?,
                            ergonomics_json,
                            rp_max,
                            home_floor,
                            mx_score,
                            to_i64(generation)?,
                            coverage_cell(point),
                        ],
                    )
                    .map_err(db_error)?;
                let state_id = transaction.last_insert_rowid();
                for (band_id, signature) in band_signatures(&key, metadata.index_radius) {
                    transaction
                        .execute(
                            "INSERT INTO state_bands(band_id, signature, state_id)
                             VALUES (?1, ?2, ?3)",
                            params![to_i64(band_id)?, signature, state_id],
                        )
                        .map_err(db_error)?;
                }
                imported += 1;
                state_id
            };
            transaction
                .execute(
                    "INSERT OR IGNORE INTO state_sources(state_id, source_id) VALUES (?1, ?2)",
                    params![state_id, source_id],
                )
                .map_err(db_error)?;
        }
    }
    Ok(imported)
}

const ENTRY_COLUMNS: &str = "state_key, layout_id, iteration, ckt_v4, memory, displaced_initials,
     displaced_vowels, ergonomics_json, first_seen_generation,
     last_seen_generation, evaluations, last_seeded_generation";

fn query_fresh_entries(
    connection: &Connection,
    generation: usize,
    threshold: f64,
) -> Result<Vec<ExplorationEntry>, String> {
    let sql = format!(
        "SELECT {ENTRY_COLUMNS} FROM states
         WHERE first_seen_generation = ?1 AND ckt_v4 <= ?2
         ORDER BY ckt_v4, state_key"
    );
    let mut statement = connection.prepare(&sql).map_err(db_error)?;
    let rows = statement
        .query_map(params![to_i64(generation)?, threshold], row_to_entry)
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

fn query_candidate_slice(
    connection: &Connection,
    threshold: f64,
    limit: usize,
    filter: &str,
    order: &str,
) -> Result<Vec<ExplorationEntry>, String> {
    let allowed = [
        ("1", "ckt_v4 ASC"),
        ("rp_max IS NOT NULL", "rp_max ASC, ckt_v4 ASC"),
        ("home_floor IS NOT NULL", "home_floor DESC, ckt_v4 ASC"),
        ("mx_score IS NOT NULL", "mx_score DESC, ckt_v4 ASC"),
        ("1", "memory ASC, ckt_v4 ASC"),
    ];
    if !allowed.contains(&(filter, order)) {
        return Err("invalid database candidate ordering".to_owned());
    }
    let sql = format!(
        "SELECT {ENTRY_COLUMNS} FROM states
         WHERE ckt_v4 <= ?1 AND {filter} ORDER BY {order}, state_key LIMIT ?2"
    );
    let mut statement = connection.prepare(&sql).map_err(db_error)?;
    let rows = statement
        .query_map(params![threshold, to_i64(limit)?], row_to_entry)
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

fn row_to_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<ExplorationEntry> {
    let key = row.get::<_, Vec<u8>>(0)?;
    let layout_id = row.get::<_, String>(1)?;
    let ergonomics_json = row.get::<_, Option<String>>(7)?;
    let ergonomics = ergonomics_json
        .map(|value| {
            serde_json::from_str::<ErgonomicFrontierMetrics>(&value).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    value.len(),
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })
        })
        .transpose()?;
    let layout = layout_from_state_bytes(layout_id, &key).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            key.len(),
            rusqlite::types::Type::Blob,
            Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, error)),
        )
    })?;
    Ok(ExplorationEntry {
        state_key: hex_key(&key),
        point: FrontierPoint {
            metrics: FrontierMetrics {
                ckt_v4: row.get(3)?,
                memory: row_usize(row, 4)?,
                displaced_initials: row_usize(row, 5)?,
                displaced_vowels: row_usize(row, 6)?,
                ergonomics,
            },
            layout,
            iteration: row_usize(row, 2)?,
        },
        first_seen_generation: row_usize(row, 8)?,
        last_seen_generation: row_usize(row, 9)?,
        evaluations: row_usize(row, 10)?,
        sources: Vec::new(),
        last_seeded_generation: row
            .get::<_, Option<i64>>(11)?
            .map(|value| usize::try_from(value).map_err(integral_error))
            .transpose()?,
    })
}

fn row_usize(row: &rusqlite::Row<'_>, index: usize) -> rusqlite::Result<usize> {
    usize::try_from(row.get::<_, i64>(index)?).map_err(integral_error)
}

fn integral_error(error: std::num::TryFromIntError) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Integer, Box::new(error))
}

fn layout_from_state_bytes(id: String, bytes: &[u8]) -> Result<RegularLayout, String> {
    if bytes.len() != 69 {
        return Err(format!(
            "invalid state key length {}; expected 69",
            bytes.len()
        ));
    }
    Ok(RegularLayout {
        id,
        capacity: [bytes[0], bytes[1]],
        head_keys: bytes[2..29].to_vec(),
        final_keys: bytes[29..64].to_vec(),
        tone: bytes[64..69]
            .try_into()
            .map_err(|_| "invalid tone state".to_owned())?,
    })
}

fn band_signatures(state: &[u8], radius: usize) -> Vec<(usize, Vec<u8>)> {
    let bands = radius + 1;
    let values = &state[2..];
    (0..bands)
        .map(|band| {
            (
                band,
                values
                    .iter()
                    .enumerate()
                    .filter(|(index, _)| index % bands == band)
                    .map(|(_, value)| *value)
                    .collect(),
            )
        })
        .collect()
}

fn nearest_prior_distance(
    connection: &Connection,
    state: &[u8],
    prior_generation: usize,
    prior_count: usize,
    radius: usize,
) -> Result<DistanceEstimate, String> {
    if prior_count == 0 {
        return Ok(DistanceEstimate {
            distance: None,
            exact: true,
        });
    }
    let mut keys = BTreeSet::new();
    let mut statement = connection
        .prepare(
            "SELECT s.state_key
             FROM state_bands b JOIN states s ON s.state_id = b.state_id
             WHERE b.band_id = ?1 AND b.signature = ?2
               AND s.first_seen_generation <= ?3",
        )
        .map_err(db_error)?;
    for (band_id, signature) in band_signatures(state, radius) {
        let rows = statement
            .query_map(
                params![to_i64(band_id)?, signature, to_i64(prior_generation)?],
                |row| row.get::<_, Vec<u8>>(0),
            )
            .map_err(db_error)?;
        for key in rows {
            keys.insert(key.map_err(db_error)?);
        }
    }
    let nearest = keys.iter().map(|key| state_distance(state, key)).min();
    if let Some(distance) = nearest.filter(|distance| *distance <= radius) {
        Ok(DistanceEstimate {
            distance: Some(distance),
            exact: true,
        })
    } else {
        Ok(DistanceEstimate {
            distance: Some(radius + 1),
            exact: false,
        })
    }
}

fn state_distance(left: &[u8], right: &[u8]) -> usize {
    left[2..]
        .iter()
        .zip(&right[2..])
        .filter(|(left, right)| left != right)
        .count()
}

fn select_seeds(
    entries: &[ExplorationEntry],
    eligible: &[usize],
    fresh: &[usize],
    coverage: &BTreeMap<String, usize>,
    prior_distances: &[DistanceEstimate],
    generation: usize,
    seed_count: usize,
) -> Result<Vec<(usize, String)>, String> {
    let mut selected = Vec::new();
    let mut used = BTreeSet::new();
    let preferred = if fresh.is_empty() { eligible } else { fresh };
    if let Some(&best) = preferred.first() {
        selected.push((
            best,
            if fresh.is_empty() {
                "best-available-ckt-v4"
            } else {
                "best-new-ckt-v4"
            }
            .to_owned(),
        ));
        used.insert(best);
    }
    let metrics = ["right-pinky", "home-row", "moving-hand", "memory"];
    let metric_slots = seed_count.saturating_sub(2).min(metrics.len());
    for offset in 0..metric_slots {
        let metric = metrics[(generation.saturating_sub(1) + offset) % metrics.len()];
        if let Some(index) = preferred
            .iter()
            .copied()
            .filter(|index| !used.contains(index))
            .min_by(|&left, &right| metric_order(metric, &entries[left], &entries[right]))
        {
            selected.push((index, format!("metric-extreme:{metric}")));
            used.insert(index);
        }
    }
    fill_diverse(
        entries,
        preferred,
        coverage,
        prior_distances,
        generation,
        seed_count,
        &mut selected,
        &mut used,
    )?;
    fill_diverse(
        entries,
        eligible,
        coverage,
        prior_distances,
        generation,
        seed_count,
        &mut selected,
        &mut used,
    )?;
    Ok(selected)
}

#[allow(clippy::too_many_arguments)]
fn fill_diverse(
    entries: &[ExplorationEntry],
    candidates: &[usize],
    coverage: &BTreeMap<String, usize>,
    prior_distances: &[DistanceEstimate],
    generation: usize,
    seed_count: usize,
    selected: &mut Vec<(usize, String)>,
    used: &mut BTreeSet<usize>,
) -> Result<(), String> {
    while selected.len() < seed_count && candidates.iter().any(|index| !used.contains(index)) {
        let candidate = candidates
            .iter()
            .copied()
            .filter(|index| !used.contains(index))
            .max_by(|&left, &right| {
                diversity_tuple(
                    left,
                    entries,
                    selected,
                    coverage,
                    prior_distances,
                    generation,
                )
                .cmp(&diversity_tuple(
                    right,
                    entries,
                    selected,
                    coverage,
                    prior_distances,
                    generation,
                ))
                .then_with(|| candidate_order(&entries[right], &entries[left]))
            })
            .ok_or("failed to select a diverse exploration seed")?;
        selected.push((candidate, "novel-sparse-coverage".to_owned()));
        used.insert(candidate);
    }
    Ok(())
}

fn diversity_tuple(
    index: usize,
    entries: &[ExplorationEntry],
    selected: &[(usize, String)],
    coverage: &BTreeMap<String, usize>,
    prior_distances: &[DistanceEstimate],
    generation: usize,
) -> (usize, usize, usize, usize, usize) {
    let entry = &entries[index];
    let state = state_bytes_from_entry(entry);
    let selected_distance = selected
        .iter()
        .map(|(other, _)| state_distance(&state, &state_bytes_from_entry(&entries[*other])))
        .min()
        .unwrap_or(usize::MAX / 4);
    let prior_distance = prior_distances[index].distance.unwrap_or(usize::MAX / 4);
    let fresh = usize::from(entry.first_seen_generation == generation);
    let not_recently_seeded = usize::from(
        entry
            .last_seeded_generation
            .is_none_or(|value| value + 1 < generation),
    );
    let sparse = usize::MAX - coverage[&coverage_cell(&entry.point)];
    (
        fresh,
        not_recently_seeded,
        selected_distance,
        prior_distance,
        sparse,
    )
}

fn review_candidates(
    connection: &Connection,
    fresh_entries: &[ExplorationEntry],
    prior_generation: usize,
    prior_count: usize,
    best: f64,
    index_radius: usize,
    config: ExplorationConfig,
) -> Result<Vec<ReviewCandidate>, String> {
    if prior_count == 0 {
        return Ok(Vec::new());
    }
    let mut fresh: Vec<_> = fresh_entries
        .iter()
        .filter(|entry| entry.point.metrics.ckt_v4 <= best + config.max_ckt_delta)
        .cloned()
        .collect();
    fresh.sort_by(candidate_order);
    let prior_best = connection
        .query_row(
            "SELECT MIN(ckt_v4) FROM states WHERE first_seen_generation <= ?1",
            [to_i64(prior_generation)?],
            |row| row.get::<_, Option<f64>>(0),
        )
        .map_err(db_error)?;
    let support_index = MemoryBandIndex::new(&fresh, config.basin_radius);
    let mut result: Vec<ReviewCandidate> = Vec::new();
    for (index, entry) in fresh.iter().enumerate() {
        let state = state_bytes_from_entry(entry);
        let estimate = nearest_prior_distance(
            connection,
            &state,
            prior_generation,
            prior_count,
            index_radius,
        )?;
        let support = support_index.neighbour_count(index, &fresh, config.basin_radius);
        let far_from_prior = estimate
            .distance
            .is_none_or(|value| value >= config.novelty_distance);
        let improves_prior = prior_best.is_none_or(|value| entry.point.metrics.ckt_v4 < value);
        let distance_description = match (estimate.distance, estimate.exact) {
            (Some(value), true) => value.to_string(),
            (Some(value), false) => format!(">={value}"),
            (None, _) => "none".to_owned(),
        };
        let (kind, rationale) = if far_from_prior && support >= config.basin_support {
            (
                "emerging-basin",
                format!(
                    "{support} competitive new states cluster within radius {}; nearest prior distance is {distance_description}",
                    config.basin_radius
                ),
            )
        } else if far_from_prior && improves_prior {
            (
                "isolated-breakthrough",
                format!(
                    "improves the prior best while nearest prior distance is {distance_description}; verify before allocating a basin campaign"
                ),
            )
        } else {
            continue;
        };
        if result.iter().any(|candidate| {
            state_distance(&state, &layout_state_bytes(&candidate.point.layout))
                <= config.basin_radius
        }) {
            continue;
        }
        result.push(ReviewCandidate {
            kind: kind.to_owned(),
            rationale,
            state_key: entry.state_key.clone(),
            nearest_prior_distance: estimate.distance,
            nearest_prior_distance_exact: estimate.exact,
            new_neighbour_support: support,
            point: entry.point.clone(),
        });
    }
    result.sort_by(|left, right| {
        left.point
            .metrics
            .ckt_v4
            .total_cmp(&right.point.metrics.ckt_v4)
            .then_with(|| left.state_key.cmp(&right.state_key))
    });
    Ok(result)
}

struct MemoryBandIndex {
    radius: usize,
    buckets: BTreeMap<(usize, Vec<u8>), Vec<usize>>,
}

impl MemoryBandIndex {
    fn new(entries: &[ExplorationEntry], radius: usize) -> Self {
        let mut buckets = BTreeMap::new();
        for (index, entry) in entries.iter().enumerate() {
            for (band, signature) in band_signatures(&state_bytes_from_entry(entry), radius) {
                buckets
                    .entry((band, signature))
                    .or_insert_with(Vec::new)
                    .push(index);
            }
        }
        Self { radius, buckets }
    }

    fn neighbour_count(&self, index: usize, entries: &[ExplorationEntry], radius: usize) -> usize {
        let state = state_bytes_from_entry(&entries[index]);
        let mut candidates = BTreeSet::new();
        for signature in band_signatures(&state, self.radius) {
            if let Some(indices) = self.buckets.get(&signature) {
                candidates.extend(indices.iter().copied());
            }
        }
        candidates
            .into_iter()
            .filter(|other| {
                state_distance(&state, &state_bytes_from_entry(&entries[*other])) <= radius
            })
            .count()
    }
}

fn candidate_order(left: &ExplorationEntry, right: &ExplorationEntry) -> Ordering {
    left.point
        .metrics
        .ckt_v4
        .total_cmp(&right.point.metrics.ckt_v4)
        .then_with(|| left.state_key.cmp(&right.state_key))
}

fn metric_order(metric: &str, left: &ExplorationEntry, right: &ExplorationEntry) -> Ordering {
    let value = |entry: &ExplorationEntry| match metric {
        "right-pinky" => entry
            .point
            .metrics
            .ergonomics
            .map_or(f64::INFINITY, |value| value.loads.rp_max),
        "home-row" => entry
            .point
            .metrics
            .ergonomics
            .map_or(f64::INFINITY, |value| -value.loads.home_floor),
        "moving-hand" => entry
            .point
            .metrics
            .ergonomics
            .and_then(|value| value.mx_score)
            .map_or(f64::INFINITY, |value| -value),
        "memory" => entry.point.metrics.memory as f64,
        _ => f64::INFINITY,
    };
    value(left)
        .total_cmp(&value(right))
        .then_with(|| {
            left.point
                .metrics
                .ckt_v4
                .total_cmp(&right.point.metrics.ckt_v4)
        })
        .then_with(|| left.state_key.cmp(&right.state_key))
}

fn count_all_states(connection: &Connection) -> Result<usize, String> {
    let count = connection
        .query_row("SELECT COUNT(*) FROM states", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(db_error)?;
    to_usize(count)
}

fn count_states_through(connection: &Connection, generation: usize) -> Result<usize, String> {
    let count = connection
        .query_row(
            "SELECT COUNT(*) FROM states WHERE first_seen_generation <= ?1",
            [to_i64(generation)?],
            |row| row.get::<_, i64>(0),
        )
        .map_err(db_error)?;
    to_usize(count)
}

fn state_bytes_from_entry(entry: &ExplorationEntry) -> Vec<u8> {
    layout_state_bytes(&entry.point.layout)
}

fn hex_key(bytes: &[u8]) -> String {
    bytes.iter().map(|value| format!("{value:02x}")).collect()
}

fn to_i64(value: usize) -> Result<i64, String> {
    i64::try_from(value).map_err(|error| error.to_string())
}

fn to_usize(value: i64) -> Result<usize, String> {
    usize::try_from(value).map_err(|error| error.to_string())
}

fn db_error(error: rusqlite::Error) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::{band_signatures, state_distance};

    #[test]
    fn band_index_cannot_miss_a_state_inside_its_radius() {
        let base: Vec<_> = (0..69).map(|value| value as u8).collect();
        for radius in 0..=12 {
            let mut changed = base.clone();
            for index in 0..radius {
                changed[index + 2] ^= 0x80;
            }
            assert_eq!(state_distance(&base, &changed), radius);
            let left = band_signatures(&base, radius);
            let right = band_signatures(&changed, radius);
            assert!(left.iter().any(|signature| right.contains(signature)));
        }
    }
}
