use crate::PackedCode;
use crate::model::{Outcome, Pool, Row, row_cmp, validate_rows};
use std::ffi::{c_char, c_int};
use std::time::{Duration, Instant};

const PRIORITY_LIMIT: usize = 1 << 23;

unsafe extern "C" {
    fn ckt_cuda_device_name(output: *mut c_char, capacity: usize) -> c_int;
    fn ckt_cuda_rank(
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
    pub launches: usize,
}

#[derive(Clone, Debug)]
pub struct CudaResolvePlan {
    priority_by_row: Vec<u32>,
    orders: Vec<u8>,
    contract: Vec<RowContract>,
}

#[derive(Clone, Debug)]
struct RowContract {
    id: String,
    weight_bits: u64,
    base_length: u8,
    stages: Vec<(u8, u64)>,
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
                    .map(|stage| (stage.order, pool_index(stage.pool)))
                    .collect(),
            })
            .collect();
        Ok(Self {
            priority_by_row,
            orders,
            contract,
        })
    }

    pub fn resolve<F>(
        &self,
        rows: &[Row],
        motor_cost: F,
    ) -> Result<(Vec<Outcome>, CudaResolveTimings), String>
    where
        F: Fn(PackedCode) -> Option<f64>,
    {
        self.validate_contract(rows)?;
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
            let ranks = rank_on_device(&groups, &entry_priorities)?;
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

    fn validate_contract(&self, rows: &[Row]) -> Result<(), String> {
        if rows.len() != self.contract.len() {
            return Err("CUDA resolver plan row count differs".to_owned());
        }
        for (index, (row, expected)) in rows.iter().zip(&self.contract).enumerate() {
            let matches = row.id == expected.id
                && row.weight.to_bits() == expected.weight_bits
                && row.base_length == expected.base_length
                && row.stages.len() == expected.stages.len()
                && row
                    .stages
                    .iter()
                    .zip(&expected.stages)
                    .all(|(stage, &(order, pool))| {
                        stage.order == order
                            && pool_index(stage.pool) == pool
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
                    });
            if !matches {
                return Err(format!(
                    "CUDA resolver plan contract differs at row {index}"
                ));
            }
        }
        Ok(())
    }
}

fn rank_on_device(groups: &[u64], priorities: &[u32]) -> Result<Vec<u32>, String> {
    if groups.len() != priorities.len() {
        return Err("CUDA rank input length differs".to_owned());
    }
    if groups.is_empty() {
        return Ok(Vec::new());
    }
    let mut ranks = vec![0_u32; groups.len()];
    let mut message = vec![0_i8; 1024];
    let status = unsafe {
        ckt_cuda_rank(
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
        }

        let candidate = multi_stage_rows();
        let plan = CudaResolvePlan::new(&candidate).unwrap();
        let cpu = resolve(&candidate, |value| Some(value.bits() as f64)).unwrap();
        let (gpu, _) = plan
            .resolve(&candidate, |value| Some(value.bits() as f64))
            .unwrap();
        assert_eq!(gpu, cpu);
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
