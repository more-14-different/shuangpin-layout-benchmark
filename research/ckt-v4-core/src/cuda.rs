use crate::PackedCode;
use crate::model::{Outcome, Pool, Row, row_cmp, validate_rows};
use std::collections::HashMap;
use std::ffi::{c_char, c_int, c_void};
use std::hash::{BuildHasherDefault, Hasher};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const PRIORITY_LIMIT: usize = 1 << 23;

#[derive(Default)]
struct PackedCodeHasher(u64);

impl Hasher for PackedCodeHasher {
    fn finish(&self) -> u64 {
        let mut value = self.0;
        value ^= value >> 30;
        value = value.wrapping_mul(0xbf58_476d_1ce4_e5b9);
        value ^= value >> 27;
        value = value.wrapping_mul(0x94d0_49bb_1331_11eb);
        value ^ (value >> 31)
    }

    fn write(&mut self, bytes: &[u8]) {
        for &byte in bytes {
            self.0 = self.0.wrapping_mul(0x100_0000_01b3) ^ u64::from(byte);
        }
    }

    fn write_u64(&mut self, value: u64) {
        self.0 = value;
    }

    fn write_u8(&mut self, value: u8) {
        self.0 ^= u64::from(value) << 56;
    }
}

type MotorCache = HashMap<PackedCode, f64, BuildHasherDefault<PackedCodeHasher>>;

unsafe extern "C" {
    fn ckt_cuda_device_name(output: *mut c_char, capacity: usize) -> c_int;
    fn ckt_cuda_workspace_create(message: *mut c_char, message_capacity: usize) -> *mut c_void;
    fn ckt_cuda_workspace_destroy(workspace: *mut c_void);
    fn ckt_cuda_workspace_set_topology(
        workspace: *mut c_void,
        priorities: *const u32,
        row_first_stage: *const u32,
        stage_order: *const u32,
        stage_pool: *const u32,
        stage_slot_offset: *const u32,
        stage_slot_count: *const u32,
        stage_next: *const u32,
        slot_row: *const u32,
        slot_stage: *const u32,
        order_offsets: *const u32,
        order_slots: *const u32,
        row_count: usize,
        stage_count: usize,
        slot_count: usize,
        order_count: usize,
        message: *mut c_char,
        message_capacity: usize,
    ) -> c_int;
    fn ckt_cuda_resolve_batch(
        workspace: *mut c_void,
        codes: *const u64,
        costs: *const f64,
        outcome_codes: *mut u64,
        outcome_costs: *mut f64,
        outcome_ranks: *mut u32,
        outcome_stages: *mut u32,
        lanes: usize,
        message: *mut c_char,
        message_capacity: usize,
    ) -> c_int;
    fn ckt_cuda_resolve_finalists_batch(
        workspace: *mut c_void,
        codes: *const u64,
        outcome_ranks: *mut u32,
        outcome_stages: *mut u32,
        finalist_indices: *mut u32,
        finalist_capacity: usize,
        finalist_count: *mut usize,
        lanes: usize,
        message: *mut c_char,
        message_capacity: usize,
    ) -> c_int;
    fn ckt_cuda_rank(
        workspace: *mut c_void,
        groups: *const u64,
        priorities: *const u32,
        ranks: *mut u32,
        length: usize,
        message: *mut c_char,
        message_capacity: usize,
    ) -> c_int;
    fn ckt_cuda_rank_batch(
        workspace: *mut c_void,
        groups: *const u64,
        priorities: *const u32,
        ranks: *mut u32,
        length: usize,
        message: *mut c_char,
        message_capacity: usize,
    ) -> c_int;
}

#[derive(Clone, Copy, Debug, Default)]
pub struct CudaResolveTimings {
    pub preparation: Duration,
    pub device: Duration,
    pub finalization: Duration,
    pub entries: usize,
    pub unique_codes: usize,
    pub finalists: usize,
    pub launches: usize,
}

#[derive(Debug)]
pub struct CudaResolvePlan {
    priority_by_row: Vec<u32>,
    orders: Vec<u8>,
    contract: Vec<RowContract>,
    stage_orders: Vec<u8>,
    stage_pools: Vec<u64>,
    slot_count: usize,
    slot_rows: Vec<u32>,
    workspace: Mutex<CudaWorkspace>,
}

#[derive(Debug)]
struct CudaWorkspace {
    raw: *mut c_void,
}

// CUDA runtime allocations belong to the process primary context and may be
// used from another host thread. All access is serialized by the plan mutex.
unsafe impl Send for CudaWorkspace {}

impl CudaWorkspace {
    fn new() -> Result<Self, String> {
        let mut message = vec![0_i8; 1024];
        let raw = unsafe { ckt_cuda_workspace_create(message.as_mut_ptr(), message.len()) };
        if raw.is_null() {
            let detail = message_bytes(&message);
            Err(if detail.is_empty() {
                "failed to create CUDA workspace".to_owned()
            } else {
                format!("failed to create CUDA workspace: {detail}")
            })
        } else {
            Ok(Self { raw })
        }
    }

    fn set_topology(&mut self, priorities: &[u32], topology: &CudaTopology) -> Result<(), String> {
        let mut message = vec![0_i8; 1024];
        let status = unsafe {
            ckt_cuda_workspace_set_topology(
                self.raw,
                priorities.as_ptr(),
                topology.row_first_stage.as_ptr(),
                topology.stage_order.as_ptr(),
                topology.stage_pool.as_ptr(),
                topology.stage_slot_offset.as_ptr(),
                topology.stage_slot_count.as_ptr(),
                topology.stage_next.as_ptr(),
                topology.slot_row.as_ptr(),
                topology.slot_stage.as_ptr(),
                topology.order_offsets.as_ptr(),
                topology.order_slots.as_ptr(),
                priorities.len(),
                topology.stage_order.len(),
                topology.slot_row.len(),
                topology.order_offsets.len() - 1,
                message.as_mut_ptr(),
                message.len(),
            )
        };
        cuda_result(status, &message)
    }
}

impl Drop for CudaWorkspace {
    fn drop(&mut self) {
        unsafe { ckt_cuda_workspace_destroy(self.raw) };
    }
}

#[derive(Clone, Debug)]
struct RowContract {
    id: String,
    weight_bits: u64,
    base_length: u8,
    stages: Vec<(u8, u64, usize)>,
}

#[derive(Debug)]
struct CudaTopology {
    row_first_stage: Vec<u32>,
    stage_order: Vec<u32>,
    stage_pool: Vec<u32>,
    stage_slot_offset: Vec<u32>,
    stage_slot_count: Vec<u32>,
    stage_next: Vec<u32>,
    slot_row: Vec<u32>,
    slot_stage: Vec<u32>,
    order_offsets: Vec<u32>,
    order_slots: Vec<u32>,
}

impl CudaTopology {
    fn new(rows: &[Row], priorities: &[u32], orders: &[u8]) -> Result<Self, String> {
        let mut topology = Self {
            row_first_stage: Vec::with_capacity(rows.len()),
            stage_order: Vec::new(),
            stage_pool: Vec::new(),
            stage_slot_offset: Vec::new(),
            stage_slot_count: Vec::new(),
            stage_next: Vec::new(),
            slot_row: Vec::new(),
            slot_stage: Vec::new(),
            order_offsets: Vec::with_capacity(orders.len() + 1),
            order_slots: Vec::new(),
        };
        let mut slots_by_order = vec![Vec::new(); orders.len()];
        for (row_index, row) in rows.iter().enumerate() {
            let first_stage = u32::try_from(topology.stage_order.len())
                .map_err(|_| "CUDA stage count exceeds u32 indexing")?;
            topology.row_first_stage.push(first_stage);
            for (local_stage, stage) in row.stages.iter().enumerate() {
                let stage_index = u32::try_from(topology.stage_order.len())
                    .map_err(|_| "CUDA stage count exceeds u32 indexing")?;
                let order_index = orders
                    .binary_search(&stage.order)
                    .map_err(|_| "CUDA topology stage order is absent")?;
                topology.stage_order.push(order_index as u32);
                topology.stage_pool.push(pool_index(stage.pool) as u32);
                topology
                    .stage_slot_offset
                    .push(topology.slot_row.len() as u32);
                topology.stage_slot_count.push(stage.codes.len() as u32);
                topology
                    .stage_next
                    .push(if local_stage + 1 < row.stages.len() {
                        stage_index + 1
                    } else {
                        u32::MAX
                    });
                for _ in &stage.codes {
                    let slot = u32::try_from(topology.slot_row.len())
                        .map_err(|_| "CUDA code slot count exceeds u32 indexing")?;
                    topology.slot_row.push(row_index as u32);
                    topology.slot_stage.push(stage_index);
                    slots_by_order[order_index].push(slot);
                }
            }
        }
        topology.order_offsets.push(0);
        for slots in slots_by_order {
            topology.order_slots.extend(slots);
            topology
                .order_offsets
                .push(topology.order_slots.len() as u32);
        }
        if priorities.len() != rows.len() {
            return Err("CUDA topology priority count differs".to_owned());
        }
        Ok(topology)
    }
}

pub fn cuda_device_name() -> Result<String, String> {
    let mut message = vec![0_i8; 512];
    let status = unsafe { ckt_cuda_device_name(message.as_mut_ptr(), message.len()) };
    cuda_result(status, &message)?;
    Ok(message_bytes(&message))
}

pub fn resolve_cuda<F>(
    rows: &[Row],
    motor_cost: F,
) -> Result<(Vec<Outcome>, CudaResolveTimings), String>
where
    F: Fn(PackedCode) -> Option<f64>,
{
    CudaResolvePlan::new(rows)?.resolve(rows, motor_cost)
}

impl CudaResolvePlan {
    pub fn new(rows: &[Row]) -> Result<Self, String> {
        validate_rows(rows)?;
        if rows.is_empty() {
            return Err("CUDA resolver plan requires at least one row".to_owned());
        }
        if rows.len() >= PRIORITY_LIMIT {
            return Err(format!(
                "CUDA resolver supports fewer than {PRIORITY_LIMIT} rows per mode"
            ));
        }
        let mut priorities: Vec<_> = (0..rows.len()).collect();
        priorities.sort_unstable_by(|&left, &right| row_cmp(left, right, rows));
        let mut priority_by_row = vec![0_u32; rows.len()];
        for (priority, row) in priorities.into_iter().enumerate() {
            priority_by_row[row] = priority as u32;
        }
        let mut orders: Vec<_> = rows
            .iter()
            .flat_map(|row| row.stages.iter().map(|stage| stage.order))
            .collect();
        orders.sort_unstable();
        orders.dedup();
        let contract = rows
            .iter()
            .map(|row| RowContract {
                id: row.id.clone(),
                weight_bits: row.weight.to_bits(),
                base_length: row.base_length,
                stages: row
                    .stages
                    .iter()
                    .map(|stage| (stage.order, pool_index(stage.pool), stage.codes.len()))
                    .collect(),
            })
            .collect();
        let topology = CudaTopology::new(rows, &priority_by_row, &orders)?;
        let stage_orders = rows
            .iter()
            .flat_map(|row| row.stages.iter().map(|stage| stage.order))
            .collect();
        let stage_pools = rows
            .iter()
            .flat_map(|row| row.stages.iter().map(|stage| pool_index(stage.pool)))
            .collect();
        let slot_count = topology.slot_row.len();
        let slot_rows = topology.slot_row.clone();
        let mut workspace = CudaWorkspace::new()?;
        workspace.set_topology(&priority_by_row, &topology)?;
        Ok(Self {
            priority_by_row,
            orders,
            contract,
            stage_orders,
            stage_pools,
            slot_count,
            slot_rows,
            workspace: Mutex::new(workspace),
        })
    }

    /// Uses GPU finalist compaction and CPU motor evaluation for one candidate.
    pub fn resolve<F>(
        &self,
        rows: &[Row],
        motor_cost: F,
    ) -> Result<(Vec<Outcome>, CudaResolveTimings), String>
    where
        F: Fn(PackedCode) -> Option<f64>,
    {
        let (mut batch, timings) = self.resolve_batch(&[rows], motor_cost)?;
        Ok((batch.remove(0), timings))
    }

    /// Resolves one candidate through the fused device path. This is retained for
    /// exact A/B measurements against the finalist path.
    pub fn resolve_fused<F>(
        &self,
        rows: &[Row],
        motor_cost: F,
    ) -> Result<(Vec<Outcome>, CudaResolveTimings), String>
    where
        F: Fn(PackedCode) -> Option<f64>,
    {
        let (mut batch, timings) = self.resolve_batch_costs(&[rows], motor_cost)?;
        Ok((batch.remove(0), timings))
    }

    /// Resolves independent candidates in isolated GPU lanes. The plan topology is
    /// persistent; each call uploads only flattened code bits and motor costs.
    pub fn resolve_batch_costs<F>(
        &self,
        rows_batch: &[&[Row]],
        motor_cost: F,
    ) -> Result<(Vec<Vec<Outcome>>, CudaResolveTimings), String>
    where
        F: Fn(PackedCode) -> Option<f64>,
    {
        if rows_batch.is_empty() {
            return Ok((Vec::new(), CudaResolveTimings::default()));
        }
        if rows_batch.len() >= 1 << 23 {
            return Err("CUDA resolver batch supports fewer than 2^23 candidates".to_owned());
        }
        let prepare_started = Instant::now();
        let mut codes = Vec::with_capacity(rows_batch.len() * self.slot_count);
        let mut costs = Vec::with_capacity(rows_batch.len() * self.slot_count);
        let mut motor_cache = (rows_batch.len() > 1).then(|| {
            MotorCache::with_capacity_and_hasher(self.slot_count, BuildHasherDefault::default())
        });
        for (candidate, rows) in rows_batch.iter().enumerate() {
            self.validate_contract(rows).map_err(|error| {
                format!("CUDA batch candidate {candidate} has an incompatible contract: {error}")
            })?;
            for row in *rows {
                for stage in &row.stages {
                    for &code in &stage.codes {
                        codes.push(code.bits());
                        let compute = || {
                            motor_cost(code)
                                .filter(|value| value.is_finite())
                                .unwrap_or(f64::NAN)
                        };
                        let cost = if let Some(cache) = &mut motor_cache {
                            *cache.entry(code).or_insert_with(compute)
                        } else {
                            compute()
                        };
                        costs.push(cost);
                    }
                }
            }
        }
        let flat_rows = rows_batch
            .len()
            .checked_mul(self.contract.len())
            .ok_or("CUDA batch row count overflows host indexing")?;
        let mut outcome_codes = vec![0_u64; flat_rows];
        let mut outcome_costs = vec![0.0_f64; flat_rows];
        let mut outcome_ranks = vec![0_u32; flat_rows];
        let mut outcome_stages = vec![0_u32; flat_rows];
        let preparation = prepare_started.elapsed();
        let unique_codes = motor_cache.as_ref().map_or(0, HashMap::len);

        let workspace = self
            .workspace
            .lock()
            .map_err(|_| "CUDA workspace lock is poisoned".to_owned())?;
        let device_started = Instant::now();
        let mut message = vec![0_i8; 1024];
        let status = unsafe {
            ckt_cuda_resolve_batch(
                workspace.raw,
                codes.as_ptr(),
                costs.as_ptr(),
                outcome_codes.as_mut_ptr(),
                outcome_costs.as_mut_ptr(),
                outcome_ranks.as_mut_ptr(),
                outcome_stages.as_mut_ptr(),
                rows_batch.len(),
                message.as_mut_ptr(),
                message.len(),
            )
        };
        cuda_result(status, &message)?;
        let device = device_started.elapsed();
        drop(workspace);

        let finalize_started = Instant::now();
        let row_count = self.contract.len();
        let mut outcomes = Vec::with_capacity(rows_batch.len());
        for candidate in 0..rows_batch.len() {
            let mut lane = Vec::with_capacity(row_count);
            for row_index in 0..row_count {
                let flat = candidate * row_count + row_index;
                let stage = outcome_stages[flat] as usize;
                let order = *self
                    .stage_orders
                    .get(stage)
                    .ok_or_else(|| format!("CUDA returned invalid stage {stage}"))?;
                let pool = pool_from_index(self.stage_pools[stage])?;
                let code = PackedCode::from_bits_len(outcome_codes[flat], order)?;
                lane.push(Outcome {
                    row_index,
                    code,
                    code_length: order,
                    aux_count: order.saturating_sub(self.contract[row_index].base_length),
                    rank: outcome_ranks[flat] as usize,
                    pool,
                    motor_upper_ms: outcome_costs[flat],
                });
            }
            outcomes.push(lane);
        }
        let finalization = finalize_started.elapsed();
        Ok((
            outcomes,
            CudaResolveTimings {
                preparation,
                device,
                finalization,
                entries: rows_batch.len() * self.slot_count,
                unique_codes,
                finalists: 0,
                launches: self.orders.len(),
            },
        ))
    }

    /// Resolves a batch on the GPU through rank selection, then evaluates motor
    /// cost on the CPU only for compacted minimum-rank finalists.
    pub fn resolve_batch<F>(
        &self,
        rows_batch: &[&[Row]],
        motor_cost: F,
    ) -> Result<(Vec<Vec<Outcome>>, CudaResolveTimings), String>
    where
        F: Fn(PackedCode) -> Option<f64>,
    {
        if rows_batch.is_empty() {
            return Ok((Vec::new(), CudaResolveTimings::default()));
        }
        if rows_batch.len() >= 1 << 23 {
            return Err("CUDA finalist batch supports fewer than 2^23 candidates".to_owned());
        }
        let prepare_started = Instant::now();
        let mut codes = Vec::with_capacity(rows_batch.len() * self.slot_count);
        for (candidate, rows) in rows_batch.iter().enumerate() {
            self.validate_contract(rows).map_err(|error| {
                format!("CUDA batch candidate {candidate} has an incompatible contract: {error}")
            })?;
            codes.extend(
                rows.iter()
                    .flat_map(|row| &row.stages)
                    .flat_map(|stage| &stage.codes)
                    .map(|code| code.bits()),
            );
        }
        let row_count = self.contract.len();
        let flat_rows = rows_batch
            .len()
            .checked_mul(row_count)
            .ok_or("CUDA finalist row count overflows host indexing")?;
        let mut outcome_ranks = vec![0_u32; flat_rows];
        let mut outcome_stages = vec![0_u32; flat_rows];
        let mut finalist_indices = vec![0_u32; codes.len()];
        let preparation = prepare_started.elapsed();

        let workspace = self
            .workspace
            .lock()
            .map_err(|_| "CUDA workspace lock is poisoned".to_owned())?;
        let device_started = Instant::now();
        let mut finalist_count = 0_usize;
        let mut message = vec![0_i8; 1024];
        let status = unsafe {
            ckt_cuda_resolve_finalists_batch(
                workspace.raw,
                codes.as_ptr(),
                outcome_ranks.as_mut_ptr(),
                outcome_stages.as_mut_ptr(),
                finalist_indices.as_mut_ptr(),
                finalist_indices.len(),
                &mut finalist_count,
                rows_batch.len(),
                message.as_mut_ptr(),
                message.len(),
            )
        };
        cuda_result(status, &message)?;
        let device = device_started.elapsed();
        drop(workspace);
        finalist_indices.truncate(finalist_count);

        let finalize_started = Instant::now();
        let mut chosen: Vec<Option<(PackedCode, f64)>> = vec![None; flat_rows];
        let mut motor_cache = (rows_batch.len() > 1).then(|| {
            MotorCache::with_capacity_and_hasher(finalist_count / 2, BuildHasherDefault::default())
        });
        for source in finalist_indices {
            let source = source as usize;
            let lane = source / self.slot_count;
            let slot = source % self.slot_count;
            let row_index = self.slot_rows[slot] as usize;
            let flat = lane * row_count + row_index;
            let stage = outcome_stages[flat] as usize;
            let order = *self
                .stage_orders
                .get(stage)
                .ok_or_else(|| format!("CUDA returned invalid stage {stage}"))?;
            let code = PackedCode::from_bits_len(codes[source], order)?;
            let compute = || {
                motor_cost(code)
                    .filter(|value| value.is_finite())
                    .unwrap_or(f64::NAN)
            };
            let cost = if let Some(cache) = &mut motor_cache {
                *cache.entry(code).or_insert_with(compute)
            } else {
                compute()
            };
            if !cost.is_finite() {
                continue;
            }
            if chosen[flat].is_none_or(|(_, current)| cost < current) {
                chosen[flat] = Some((code, cost));
            }
        }
        let mut outcomes = Vec::with_capacity(rows_batch.len());
        for candidate in 0..rows_batch.len() {
            let mut lane = Vec::with_capacity(row_count);
            for row_index in 0..row_count {
                let flat = candidate * row_count + row_index;
                let stage = outcome_stages[flat] as usize;
                let order = *self
                    .stage_orders
                    .get(stage)
                    .ok_or_else(|| format!("CUDA returned invalid stage {stage}"))?;
                let pool = pool_from_index(self.stage_pools[stage])?;
                let (code, motor_upper_ms) = chosen[flat].take().ok_or_else(|| {
                    format!(
                        "no motor cost for candidate {candidate} row {}",
                        self.contract[row_index].id
                    )
                })?;
                lane.push(Outcome {
                    row_index,
                    code,
                    code_length: order,
                    aux_count: order.saturating_sub(self.contract[row_index].base_length),
                    rank: outcome_ranks[flat] as usize,
                    pool,
                    motor_upper_ms,
                });
            }
            outcomes.push(lane);
        }
        let finalization = finalize_started.elapsed();
        Ok((
            outcomes,
            CudaResolveTimings {
                preparation,
                device,
                finalization,
                entries: rows_batch.len() * self.slot_count,
                unique_codes: 0,
                finalists: finalist_count,
                launches: self.orders.len(),
            },
        ))
    }

    pub fn resolve_rank_only<F>(
        &self,
        rows: &[Row],
        motor_cost: F,
    ) -> Result<(Vec<Outcome>, CudaResolveTimings), String>
    where
        F: Fn(PackedCode) -> Option<f64>,
    {
        self.validate_contract(rows)?;
        let mut workspace = self
            .workspace
            .lock()
            .map_err(|_| "CUDA workspace lock is poisoned".to_owned())?;
        let mut active: Vec<_> = (0..rows.len()).map(|row| (row, 0_usize)).collect();
        let mut outcomes: Vec<Option<Outcome>> = vec![None; rows.len()];
        let mut timings = CudaResolveTimings::default();

        for &order in &self.orders {
            let prepare_started = Instant::now();
            let mut groups = Vec::new();
            let mut entry_rows = Vec::new();
            let mut entry_codes = Vec::new();
            for &(row_index, stage_index) in &active {
                let stage = &rows[row_index].stages[stage_index];
                if stage.order != order {
                    continue;
                }
                for &code in &stage.codes {
                    groups.push((pool_index(stage.pool) << 36) | code.bits());
                    entry_rows.push(row_index);
                    entry_codes.push(code);
                }
            }
            let entry_priorities: Vec<_> = entry_rows
                .iter()
                .map(|&row| self.priority_by_row[row])
                .collect();
            timings.preparation += prepare_started.elapsed();
            timings.entries += groups.len();
            timings.launches += usize::from(!groups.is_empty());

            let device_started = Instant::now();
            let ranks = rank_on_device(&mut workspace, &groups, &entry_priorities, false)?;
            timings.device += device_started.elapsed();

            let finalize_started = Instant::now();
            let mut best_rank = vec![u32::MAX; rows.len()];
            let mut chosen = vec![None; rows.len()];
            for ((&row_index, &code), &rank) in entry_rows.iter().zip(&entry_codes).zip(&ranks) {
                if rank > best_rank[row_index] {
                    continue;
                }
                if rank < best_rank[row_index] {
                    best_rank[row_index] = rank;
                    chosen[row_index] = None;
                }
                let Some(cost) = motor_cost(code).filter(|value| value.is_finite()) else {
                    continue;
                };
                if chosen[row_index].is_none_or(|(_, current)| cost < current) {
                    chosen[row_index] = Some((code, cost));
                }
            }
            let mut next = Vec::with_capacity(active.len());
            for (row_index, mut stage_index) in active {
                let stage = &rows[row_index].stages[stage_index];
                if stage.order != order {
                    next.push((row_index, stage_index));
                    continue;
                }
                let rank = best_rank[row_index] as usize;
                let terminal = stage_index + 1 == rows[row_index].stages.len();
                if rank == 1 || terminal {
                    let (code, motor_upper_ms) = chosen[row_index]
                        .take()
                        .ok_or_else(|| format!("no motor cost for {}", rows[row_index].id))?;
                    outcomes[row_index] = Some(Outcome {
                        row_index,
                        code,
                        code_length: stage.order,
                        aux_count: stage.order.saturating_sub(rows[row_index].base_length),
                        rank,
                        pool: stage.pool,
                        motor_upper_ms,
                    });
                } else {
                    stage_index += 1;
                    next.push((row_index, stage_index));
                }
            }
            active = next;
            timings.finalization += finalize_started.elapsed();
        }
        if !active.is_empty() {
            return Err(format!("{} rows remain unresolved", active.len()));
        }
        let outcomes = outcomes
            .into_iter()
            .enumerate()
            .map(|(index, value)| value.ok_or_else(|| format!("row {index} has no outcome")))
            .collect::<Result<_, _>>()?;
        Ok((outcomes, timings))
    }

    pub fn resolve_batch_rank_only<F>(
        &self,
        rows_batch: &[&[Row]],
        motor_cost: F,
    ) -> Result<(Vec<Vec<Outcome>>, CudaResolveTimings), String>
    where
        F: Fn(PackedCode) -> Option<f64>,
    {
        if rows_batch.is_empty() {
            return Ok((Vec::new(), CudaResolveTimings::default()));
        }
        if rows_batch.len() >= 1 << 24 {
            return Err("CUDA resolver batch supports fewer than 2^24 candidates".to_owned());
        }
        for (candidate, rows) in rows_batch.iter().enumerate() {
            self.validate_contract(rows).map_err(|error| {
                format!("CUDA batch candidate {candidate} has an incompatible contract: {error}")
            })?;
        }
        let row_count = self.contract.len();
        let flat_length = rows_batch
            .len()
            .checked_mul(row_count)
            .ok_or("CUDA batch row count overflows host indexing")?;
        let mut workspace = self
            .workspace
            .lock()
            .map_err(|_| "CUDA workspace lock is poisoned".to_owned())?;
        let mut active: Vec<Vec<_>> = rows_batch
            .iter()
            .map(|rows| (0..rows.len()).map(|row| (row, 0_usize)).collect())
            .collect();
        let mut outcomes: Vec<Vec<Option<Outcome>>> = rows_batch
            .iter()
            .map(|rows| vec![None; rows.len()])
            .collect();
        let mut timings = CudaResolveTimings::default();

        for &order in &self.orders {
            let prepare_started = Instant::now();
            let mut groups = Vec::new();
            let mut entry_candidates = Vec::new();
            let mut entry_rows = Vec::new();
            let mut entry_codes = Vec::new();
            for (candidate, states) in active.iter().enumerate() {
                let rows = rows_batch[candidate];
                for &(row_index, stage_index) in states {
                    let stage = &rows[row_index].stages[stage_index];
                    if stage.order != order {
                        continue;
                    }
                    let lane = (candidate as u64) << 40;
                    for &code in &stage.codes {
                        groups.push(lane | (pool_index(stage.pool) << 36) | code.bits());
                        entry_candidates.push(candidate);
                        entry_rows.push(row_index);
                        entry_codes.push(code);
                    }
                }
            }
            let entry_priorities: Vec<_> = entry_rows
                .iter()
                .map(|&row| self.priority_by_row[row])
                .collect();
            timings.preparation += prepare_started.elapsed();
            timings.entries += groups.len();
            timings.launches += usize::from(!groups.is_empty());

            let device_started = Instant::now();
            let ranks = rank_on_device(&mut workspace, &groups, &entry_priorities, true)?;
            timings.device += device_started.elapsed();

            let finalize_started = Instant::now();
            let mut best_rank = vec![u32::MAX; flat_length];
            let mut chosen = vec![None; flat_length];
            for (((&candidate, &row_index), &code), &rank) in entry_candidates
                .iter()
                .zip(&entry_rows)
                .zip(&entry_codes)
                .zip(&ranks)
            {
                let flat = candidate * row_count + row_index;
                if rank > best_rank[flat] {
                    continue;
                }
                if rank < best_rank[flat] {
                    best_rank[flat] = rank;
                    chosen[flat] = None;
                }
                let Some(cost) = motor_cost(code).filter(|value| value.is_finite()) else {
                    continue;
                };
                if chosen[flat].is_none_or(|(_, current)| cost < current) {
                    chosen[flat] = Some((code, cost));
                }
            }
            for candidate in 0..rows_batch.len() {
                let rows = rows_batch[candidate];
                let mut next = Vec::with_capacity(active[candidate].len());
                for (row_index, mut stage_index) in std::mem::take(&mut active[candidate]) {
                    let stage = &rows[row_index].stages[stage_index];
                    if stage.order != order {
                        next.push((row_index, stage_index));
                        continue;
                    }
                    let flat = candidate * row_count + row_index;
                    let rank = best_rank[flat] as usize;
                    let terminal = stage_index + 1 == rows[row_index].stages.len();
                    if rank == 1 || terminal {
                        let (code, motor_upper_ms) = chosen[flat]
                            .take()
                            .ok_or_else(|| format!("no motor cost for {}", rows[row_index].id))?;
                        outcomes[candidate][row_index] = Some(Outcome {
                            row_index,
                            code,
                            code_length: stage.order,
                            aux_count: stage.order.saturating_sub(rows[row_index].base_length),
                            rank,
                            pool: stage.pool,
                            motor_upper_ms,
                        });
                    } else {
                        stage_index += 1;
                        next.push((row_index, stage_index));
                    }
                }
                active[candidate] = next;
            }
            timings.finalization += finalize_started.elapsed();
        }
        if let Some((candidate, rows)) =
            active.iter().enumerate().find(|(_, rows)| !rows.is_empty())
        {
            return Err(format!(
                "{} rows remain unresolved in candidate {candidate}",
                rows.len()
            ));
        }
        let outcomes = outcomes
            .into_iter()
            .enumerate()
            .map(|(candidate, rows)| {
                rows.into_iter()
                    .enumerate()
                    .map(|(row, value)| {
                        value.ok_or_else(|| {
                            format!("candidate {candidate} row {row} has no outcome")
                        })
                    })
                    .collect::<Result<Vec<_>, _>>()
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok((outcomes, timings))
    }

    fn validate_contract(&self, rows: &[Row]) -> Result<(), String> {
        if rows.len() != self.contract.len() {
            return Err("CUDA resolver plan row count differs".to_owned());
        }
        for (index, (row, expected)) in rows.iter().zip(&self.contract).enumerate() {
            let matches = row.id == expected.id
                && row.weight.to_bits() == expected.weight_bits
                && row.base_length == expected.base_length
                && row.stages.len() == expected.stages.len()
                && row.stages.iter().zip(&expected.stages).all(
                    |(stage, &(order, pool, code_count))| {
                        stage.order == order
                            && pool_index(stage.pool) == pool
                            && stage.codes.len() == code_count
                            && !stage.codes.is_empty()
                            && stage
                                .codes
                                .iter()
                                .all(|code| code.len() == usize::from(stage.order))
                            && !stage
                                .codes
                                .iter()
                                .enumerate()
                                .any(|(index, code)| stage.codes[..index].contains(code))
                    },
                );
            if !matches {
                return Err(format!(
                    "CUDA resolver plan contract differs at row {index}"
                ));
            }
        }
        Ok(())
    }
}

fn rank_on_device(
    workspace: &mut CudaWorkspace,
    groups: &[u64],
    priorities: &[u32],
    batch: bool,
) -> Result<Vec<u32>, String> {
    if groups.len() != priorities.len() {
        return Err("CUDA rank input length differs".to_owned());
    }
    if groups.is_empty() {
        return Ok(Vec::new());
    }
    let mut ranks = vec![0_u32; groups.len()];
    let mut message = vec![0_i8; 1024];
    let status = unsafe {
        let function = if batch {
            ckt_cuda_rank_batch
        } else {
            ckt_cuda_rank
        };
        function(
            workspace.raw,
            groups.as_ptr(),
            priorities.as_ptr(),
            ranks.as_mut_ptr(),
            groups.len(),
            message.as_mut_ptr(),
            message.len(),
        )
    };
    cuda_result(status, &message)?;
    Ok(ranks)
}

fn cuda_result(status: c_int, message: &[c_char]) -> Result<(), String> {
    if status == 0 {
        Ok(())
    } else {
        let detail = message_bytes(message);
        Err(if detail.is_empty() {
            format!("CUDA operation failed with status {status}")
        } else {
            format!("CUDA operation failed with status {status}: {detail}")
        })
    }
}

fn message_bytes(message: &[c_char]) -> String {
    let bytes: Vec<_> = message
        .iter()
        .take_while(|&&value| value != 0)
        .map(|&value| value as u8)
        .collect();
    String::from_utf8_lossy(&bytes).into_owned()
}

const fn pool_index(pool: Pool) -> u64 {
    match pool {
        Pool::CharBase => 0,
        Pool::CharAux1 => 1,
        Pool::CharAux2 => 2,
        Pool::WordFour => 3,
        Pool::WordFive => 4,
        Pool::WordSix => 5,
        Pool::Word3Three => 6,
        Pool::Word3FourB => 7,
        Pool::Word3FiveBb => 8,
    }
}

fn pool_from_index(index: u64) -> Result<Pool, String> {
    match index {
        0 => Ok(Pool::CharBase),
        1 => Ok(Pool::CharAux1),
        2 => Ok(Pool::CharAux2),
        3 => Ok(Pool::WordFour),
        4 => Ok(Pool::WordFive),
        5 => Ok(Pool::WordSix),
        6 => Ok(Pool::Word3Three),
        7 => Ok(Pool::Word3FourB),
        8 => Ok(Pool::Word3FiveBb),
        _ => Err(format!("CUDA returned invalid pool {index}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Kind, Stage, resolve};

    fn code(values: &[u8]) -> PackedCode {
        PackedCode::from_indices(values).unwrap()
    }

    fn rows(codes: [PackedCode; 4]) -> Vec<Row> {
        [4.0, 3.0, 2.0, 1.0]
            .into_iter()
            .enumerate()
            .map(|(index, weight)| Row {
                id: format!("row-{index}"),
                text: String::new(),
                kind: Kind::Character,
                weight,
                base_length: 1,
                stages: vec![Stage {
                    order: 1,
                    pool: Pool::CharBase,
                    codes: vec![codes[index]],
                }],
            })
            .collect()
    }

    fn multi_stage_rows() -> Vec<Row> {
        vec![
            Row {
                id: "first".to_owned(),
                text: String::new(),
                kind: Kind::Character,
                weight: 4.0,
                base_length: 1,
                stages: vec![Stage {
                    order: 1,
                    pool: Pool::CharBase,
                    codes: vec![code(&[0])],
                }],
            },
            Row {
                id: "second".to_owned(),
                text: String::new(),
                kind: Kind::Character,
                weight: 3.0,
                base_length: 1,
                stages: vec![
                    Stage {
                        order: 1,
                        pool: Pool::CharBase,
                        codes: vec![code(&[0])],
                    },
                    Stage {
                        order: 2,
                        pool: Pool::CharAux1,
                        codes: vec![code(&[1, 1]), code(&[1, 2])],
                    },
                ],
            },
            Row {
                id: "third".to_owned(),
                text: String::new(),
                kind: Kind::Character,
                weight: 2.0,
                base_length: 1,
                stages: vec![
                    Stage {
                        order: 1,
                        pool: Pool::CharBase,
                        codes: vec![code(&[0])],
                    },
                    Stage {
                        order: 2,
                        pool: Pool::CharAux1,
                        codes: vec![code(&[1, 1])],
                    },
                ],
            },
            Row {
                id: "unique".to_owned(),
                text: String::new(),
                kind: Kind::Character,
                weight: 1.0,
                base_length: 1,
                stages: vec![Stage {
                    order: 1,
                    pool: Pool::CharBase,
                    codes: vec![code(&[2])],
                }],
            },
        ]
    }

    #[test]
    #[ignore = "requires an NVIDIA CUDA device"]
    fn reusable_plan_matches_cpu_after_codes_change() {
        let first = rows([code(&[0]), code(&[0]), code(&[0]), code(&[1])]);
        let plan = CudaResolvePlan::new(&first).unwrap();
        for candidate in [
            first,
            rows([code(&[2]), code(&[2]), code(&[3]), code(&[2])]),
        ] {
            let cpu = resolve(&candidate, |value| Some(value.bits() as f64)).unwrap();
            let (gpu, _) = plan
                .resolve(&candidate, |value| Some(value.bits() as f64))
                .unwrap();
            assert_eq!(gpu, cpu);
            let (fused, _) = plan
                .resolve_fused(&candidate, |value| Some(value.bits() as f64))
                .unwrap();
            assert_eq!(fused, cpu);
        }

        let candidate = multi_stage_rows();
        let plan = CudaResolvePlan::new(&candidate).unwrap();
        let cpu = resolve(&candidate, |value| Some(value.bits() as f64)).unwrap();
        let (gpu, _) = plan
            .resolve(&candidate, |value| Some(value.bits() as f64))
            .unwrap();
        assert_eq!(gpu, cpu);
        let (fused, _) = plan
            .resolve_fused(&candidate, |value| Some(value.bits() as f64))
            .unwrap();
        assert_eq!(fused, cpu);

        let mut second = candidate.clone();
        second[0].stages[0].codes[0] = code(&[3]);
        second[3].stages[0].codes[0] = code(&[0]);
        let expected = [&candidate, &second]
            .map(|rows| resolve(rows, |value| Some(value.bits() as f64)).unwrap());
        let (batch, timings) = plan
            .resolve_batch_costs(&[&candidate, &second], |value| Some(value.bits() as f64))
            .unwrap();
        assert_eq!(batch, expected);
        assert_eq!(timings.launches, 2);
        let (finalists, finalist_timings) = plan
            .resolve_batch(&[&candidate, &second], |value| Some(value.bits() as f64))
            .unwrap();
        assert_eq!(finalists, expected);
        assert!(finalist_timings.finalists >= candidate.len() + second.len());
    }

    #[test]
    fn reusable_plan_rejects_invalid_changed_codes_before_launch() {
        let first = rows([code(&[0]), code(&[0]), code(&[0]), code(&[1])]);
        let plan = CudaResolvePlan::new(&first).unwrap();
        let mut invalid = first;
        invalid[0].stages[0].codes.push(code(&[0]));
        let error = plan
            .resolve(&invalid, |value| Some(value.bits() as f64))
            .unwrap_err();
        assert!(error.contains("contract differs"));
    }
}
