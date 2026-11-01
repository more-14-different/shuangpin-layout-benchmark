use crate::compact::PackedCode;
use crate::model::{Outcome, Pool, Row, resolve, validate_rows};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

type StageKey = (Pool, PackedCode);
type MotorCost = dyn Fn(PackedCode) -> Option<f64> + Send + Sync;

#[derive(Clone, Debug)]
pub struct UpdateReceipt {
    old_rows: Vec<(usize, Row)>,
    pub affected_rows: usize,
    outcome_changes: Vec<OutcomeChange>,
}

#[derive(Clone, Debug)]
pub struct OutcomeChange {
    pub row_index: usize,
    pub old: Outcome,
    pub new: Outcome,
}

impl UpdateReceipt {
    pub fn outcome_changes(&self) -> &[OutcomeChange] {
        &self.outcome_changes
    }
}

pub struct IncrementalResolver {
    rows: Vec<Row>,
    outcomes: Vec<Outcome>,
    members: Option<HashMap<StageKey, HashSet<usize>>>,
    motor_cost: Arc<MotorCost>,
}

impl IncrementalResolver {
    pub fn new<F>(rows: Vec<Row>, motor_cost: F) -> Result<Self, String>
    where
        F: Fn(PackedCode) -> Option<f64> + Send + Sync + 'static,
    {
        let motor_cost: Arc<MotorCost> = Arc::new(motor_cost);
        let outcomes = resolve(&rows, |code| motor_cost(code))?;
        Ok(Self {
            rows,
            outcomes,
            members: None,
            motor_cost,
        })
    }

    pub fn from_precomputed<F>(
        rows: Vec<Row>,
        outcomes: Vec<Outcome>,
        motor_cost: F,
    ) -> Result<Self, String>
    where
        F: Fn(PackedCode) -> Option<f64> + Send + Sync + 'static,
    {
        validate_rows(&rows)?;
        if rows.len() != outcomes.len() {
            return Err("precomputed outcome count differs from rows".to_owned());
        }
        for (index, (row, outcome)) in rows.iter().zip(&outcomes).enumerate() {
            let stage = row
                .stages
                .iter()
                .find(|stage| {
                    stage.order == outcome.code_length
                        && stage.pool == outcome.pool
                        && stage.codes.contains(&outcome.code)
                })
                .ok_or_else(|| format!("precomputed outcome {index} is absent from its row"))?;
            let expected_motor = motor_cost(outcome.code)
                .filter(|value| value.is_finite())
                .ok_or_else(|| format!("precomputed outcome {index} has no motor cost"))?;
            if outcome.row_index != index
                || outcome.rank == 0
                || outcome.aux_count != stage.order.saturating_sub(row.base_length)
                || outcome.motor_upper_ms.to_bits() != expected_motor.to_bits()
            {
                return Err(format!(
                    "precomputed outcome {index} is inconsistent: row-index={}/{index} rank={} aux={}/{} motor-bits={}/{}",
                    outcome.row_index,
                    outcome.rank,
                    outcome.aux_count,
                    stage.order.saturating_sub(row.base_length),
                    outcome.motor_upper_ms.to_bits(),
                    expected_motor.to_bits(),
                ));
            }
        }
        Ok(Self {
            rows,
            outcomes,
            members: None,
            motor_cost: Arc::new(motor_cost),
        })
    }

    pub fn rows(&self) -> &[Row] {
        &self.rows
    }

    pub fn outcomes(&self) -> &[Outcome] {
        &self.outcomes
    }

    fn build_members(rows: &[Row]) -> HashMap<StageKey, HashSet<usize>> {
        let mut members: HashMap<StageKey, HashSet<usize>> = HashMap::new();
        for (index, row) in rows.iter().enumerate() {
            for stage in &row.stages {
                for &code in &stage.codes {
                    members.entry((stage.pool, code)).or_default().insert(index);
                }
            }
        }
        members
    }

    fn component(&self, seeds: impl IntoIterator<Item = usize>) -> HashSet<usize> {
        let members = self
            .members
            .as_ref()
            .expect("members are initialized before component search");
        let mut found = HashSet::new();
        let mut pending = Vec::new();
        for seed in seeds {
            if found.insert(seed) {
                pending.push(seed);
            }
        }
        while let Some(index) = pending.pop() {
            for stage in &self.rows[index].stages {
                for &code in &stage.codes {
                    if let Some(neighbors) = members.get(&(stage.pool, code)) {
                        for &neighbor in neighbors {
                            if found.insert(neighbor) {
                                pending.push(neighbor);
                            }
                        }
                    }
                }
            }
        }
        found
    }

    fn remove_memberships(&mut self, index: usize, row: &Row) {
        let members = self
            .members
            .as_mut()
            .expect("members are initialized before removal");
        for stage in &row.stages {
            for &code in &stage.codes {
                let key = (stage.pool, code);
                if let Some(bucket) = members.get_mut(&key) {
                    bucket.remove(&index);
                    if bucket.is_empty() {
                        members.remove(&key);
                    }
                }
            }
        }
    }

    fn add_memberships(&mut self, index: usize, row: &Row) {
        let members = self
            .members
            .as_mut()
            .expect("members are initialized before insertion");
        for stage in &row.stages {
            for &code in &stage.codes {
                members.entry((stage.pool, code)).or_default().insert(index);
            }
        }
    }

    /// Apply row replacements and exactly recompute the transitive collision
    /// component touched by their old or new stage codes.
    pub fn apply_updates(&mut self, updates: Vec<(usize, Row)>) -> Result<UpdateReceipt, String> {
        if updates.is_empty() {
            return Ok(UpdateReceipt {
                old_rows: Vec::new(),
                affected_rows: 0,
                outcome_changes: Vec::new(),
            });
        }
        if self.members.is_none() {
            self.members = Some(Self::build_members(&self.rows));
        }
        let mut seen = HashSet::new();
        for (index, _) in &updates {
            if *index >= self.rows.len() || !seen.insert(*index) {
                return Err(format!("invalid or duplicate row update index {index}"));
            }
        }
        for (index, replacement) in &updates {
            // This resolver is a fixed-topology update engine: a replacement
            // may change stages and weights, but it must still describe the
            // same stable row.  Comparing with the indexed row is both stricter
            // and O(update count), unlike rescanning the full corpus per row.
            if self.rows[*index].id != replacement.id {
                return Err(format!(
                    "replacement row id differs at index {index}: {:?} != {:?}",
                    replacement.id, self.rows[*index].id
                ));
            }
            for stage in &replacement.stages {
                for &code in &stage.codes {
                    if (self.motor_cost)(code).is_none() {
                        return Err(format!("replacement row {index} has an unsupported code"));
                    }
                }
            }
        }
        let replacement_rows: Vec<_> = updates.iter().map(|(_, row)| row.clone()).collect();
        resolve(&replacement_rows, |code| (self.motor_cost)(code))?;
        let seeds: Vec<_> = updates.iter().map(|(index, _)| *index).collect();
        let old_component = self.component(seeds.iter().copied());
        let old_rows: Vec<_> = updates
            .iter()
            .map(|(index, _)| (*index, self.rows[*index].clone()))
            .collect();

        for (index, replacement) in updates {
            let old = self.rows[index].clone();
            self.remove_memberships(index, &old);
            self.rows[index] = replacement;
            let new = self.rows[index].clone();
            self.add_memberships(index, &new);
        }

        let mut affected = old_component;
        affected.extend(self.component(seeds));
        // Closing the union makes the proof robust if a batch replacement joins
        // two components through a row that was in the old component only.
        loop {
            let closed = self.component(affected.iter().copied());
            if closed.len() == affected.len() {
                break;
            }
            affected.extend(closed);
        }

        let mut indices: Vec<_> = affected.into_iter().collect();
        indices.sort_unstable();
        let subset: Vec<_> = indices
            .iter()
            .map(|&index| self.rows[index].clone())
            .collect();
        let resolved = resolve(&subset, |code| (self.motor_cost)(code))?;
        let mut outcome_changes = Vec::with_capacity(indices.len());
        for (mut outcome, &global_index) in resolved.into_iter().zip(&indices) {
            outcome.row_index = global_index;
            outcome_changes.push(OutcomeChange {
                row_index: global_index,
                old: self.outcomes[global_index].clone(),
                new: outcome.clone(),
            });
            self.outcomes[global_index] = outcome;
        }
        Ok(UpdateReceipt {
            old_rows,
            affected_rows: indices.len(),
            outcome_changes,
        })
    }

    pub fn rollback(&mut self, receipt: UpdateReceipt) -> Result<UpdateReceipt, String> {
        self.apply_updates(receipt.old_rows)
    }

    pub fn verify_against_full_recompute(&self) -> Result<(), String> {
        let full = resolve(&self.rows, |code| (self.motor_cost)(code))?;
        if full == self.outcomes {
            Ok(())
        } else {
            Err("incremental outcomes differ from full recomputation".to_owned())
        }
    }
}
