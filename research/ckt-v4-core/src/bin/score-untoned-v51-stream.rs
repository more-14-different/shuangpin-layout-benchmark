use ckt_v4_core::{KeyAlphabet, PackedCode, RoleTables};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::io::{self, BufRead, Write};
use std::{env, fs, time::Instant};

#[derive(Deserialize)]
struct StageSpec(u8, u8, Vec<Vec<u8>>);
#[derive(Deserialize)]
struct RowSpec(usize, usize, f64, u8, Vec<StageSpec>);
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    version: String,
    key_alphabet: String,
    tone_keys_by_tone: String,
    references: Vec<Vec<f64>>,
    modes: Vec<Vec<RowSpec>>,
}
struct CodeTemplate {
    tokens: [u8; 6],
    len: u8,
}
struct StageInfo {
    order: u8,
    pool: u8,
    first_code: usize,
    count: usize,
}
struct RowInfo {
    kind: usize,
    weight: f64,
    base_length: u8,
    first_stage: usize,
    count: usize,
}
struct Mode {
    rows: Vec<RowInfo>,
    stages: Vec<StageInfo>,
    codes: Vec<CodeTemplate>,
    priority: Vec<usize>,
    groups: Vec<usize>,
}
impl Mode {
    fn compile(specs: Vec<RowSpec>) -> Result<Self, String> {
        let mut mode = Self {
            rows: Vec::new(),
            stages: Vec::new(),
            codes: Vec::new(),
            priority: vec![usize::MAX; specs.len()],
            groups: Vec::new(),
        };
        for RowSpec(tie, kind, weight, base, stages) in specs {
            if tie >= mode.priority.len()
                || mode.priority[tie] != usize::MAX
                || kind > 3
                || weight <= 0.0
            {
                return Err("invalid row priority/kind/weight".into());
            }
            mode.priority[tie] = mode.rows.len();
            mode.groups.push(kind.saturating_sub(1));
            let first_stage = mode.stages.len();
            let stage_count = stages.len();
            let mut prior = 0;
            for StageSpec(order, pool, codes) in stages {
                if order <= prior || order > 6 || pool > 6 || codes.is_empty() {
                    return Err("invalid stage".into());
                }
                prior = order;
                let first_code = mode.codes.len();
                let count = codes.len();
                for code in codes {
                    if code.len() != usize::from(order) || code.iter().any(|&t| t >= 88) {
                        return Err("invalid token code".into());
                    }
                    let mut tokens = [0; 6];
                    tokens[..code.len()].copy_from_slice(&code);
                    mode.codes.push(CodeTemplate { tokens, len: order });
                }
                mode.stages.push(StageInfo {
                    order,
                    pool,
                    first_code,
                    count,
                });
            }
            mode.rows.push(RowInfo {
                kind,
                weight,
                base_length: base,
                first_stage,
                count: stage_count,
            });
        }
        Ok(mode)
    }
}
fn should_finish(rank: usize, terminal: bool) -> bool {
    rank == 1 || terminal
}
fn balanced_order(input: &[usize], groups: &[usize]) -> Vec<usize> {
    let mut output = Vec::with_capacity(input.len());
    for chunk in input.chunks(120) {
        let mut remaining = chunk.to_vec();
        while !remaining.is_empty() {
            let n = 6.min(remaining.len());
            let mut available = [0usize; 3];
            for &row in &remaining {
                available[groups[row]] += 1;
            }
            let mut targets = [0usize; 3];
            for _ in 0..n {
                let mut selected = None;
                for g in 0..3 {
                    if targets[g] < available[g] && selected.is_none_or(|s| targets[g] < targets[s])
                    {
                        selected = Some(g);
                    }
                }
                if let Some(g) = selected {
                    targets[g] += 1;
                }
            }
            let mut chosen = vec![false; remaining.len()];
            chosen[..n].fill(true);
            let mut counts = [0usize; 3];
            for &row in &remaining[..n] {
                counts[groups[row]] += 1;
            }
            for needed in 0..3 {
                while counts[needed] < targets[needed] {
                    let replacement = (n..remaining.len())
                        .find(|&i| !chosen[i] && groups[remaining[i]] == needed);
                    let displaced = (0..n).rev().find(|&i| {
                        chosen[i] && counts[groups[remaining[i]]] > targets[groups[remaining[i]]]
                    });
                    let (Some(replacement), Some(displaced)) = (replacement, displaced) else {
                        break;
                    };
                    chosen[replacement] = true;
                    chosen[displaced] = false;
                    counts[groups[remaining[displaced]]] -= 1;
                    counts[needed] += 1;
                }
            }
            let mut next = Vec::with_capacity(remaining.len() - n);
            for (i, &row) in remaining.iter().enumerate() {
                if chosen[i] {
                    output.push(row);
                } else {
                    next.push(row);
                }
            }
            remaining = next;
        }
    }
    output
}
#[derive(Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Track {
    count: usize,
    total_weight: f64,
    motor_upper_ms: f64,
    first_aux_rate: f64,
    second_aux_rate: f64,
    third_aux_rate: f64,
    selection_rate: f64,
    mean_rejected_candidates: f64,
    mean_page_actions: f64,
    mean_keys: f64,
    effective_ms: f64,
}
fn evaluate(mode: &Mode, state: &[u8], motor: &RoleTables) -> Result<[Track; 4], String> {
    let codes = mode
        .codes
        .iter()
        .map(|t| {
            let mut keys = [0u8; 6];
            for (i, &token) in t.tokens[..usize::from(t.len)].iter().enumerate() {
                keys[i] = if token < 62 {
                    state[usize::from(token)]
                } else {
                    token - 62
                };
            }
            PackedCode::from_indices(&keys[..usize::from(t.len)])
        })
        .collect::<Result<Vec<_>, _>>()?;
    let mut active = mode.priority.clone();
    let mut stage_indices = vec![0usize; mode.rows.len()];
    let mut outcomes = vec![(0usize, 0u8, 0f64); mode.rows.len()];
    let mut ranks = vec![0usize; codes.len()];
    for order in 2..=6 {
        let mut buckets: HashMap<(u8, PackedCode), Vec<(usize, usize)>> = HashMap::new();
        for &i in &active {
            let r = &mode.rows[i];
            let st = &mode.stages[r.first_stage + stage_indices[i]];
            if st.order != order {
                continue;
            }
            for code_index in st.first_code..st.first_code + st.count {
                buckets
                    .entry((st.pool, codes[code_index]))
                    .or_default()
                    .push((i, code_index));
            }
        }
        for ((pool, _), rows) in buckets {
            if pool >= 3 && order >= 4 && rows.len() > 1 {
                let indices = rows.iter().map(|r| r.0).collect::<Vec<_>>();
                let ranked = balanced_order(&indices, &mode.groups);
                // Each bucket has one code per row after stage-code dedup.
                let code_for_row: HashMap<usize, usize> = rows.into_iter().collect();
                for (rank, i) in ranked.into_iter().enumerate() {
                    ranks[code_for_row[&i]] = rank + 1;
                }
            } else {
                for (rank, (_, code_index)) in rows.into_iter().enumerate() {
                    ranks[code_index] = rank + 1;
                }
            }
        }
        let mut next = Vec::new();
        for i in active {
            let r = &mode.rows[i];
            let st = &mode.stages[r.first_stage + stage_indices[i]];
            if st.order != order {
                next.push(i);
                continue;
            }
            let range = st.first_code..st.first_code + st.count;
            let rank = range
                .clone()
                .map(|j| ranks[j])
                .min()
                .ok_or("empty code range")?;
            if rank == 0 {
                return Err("unranked code".into());
            }
            if should_finish(rank, stage_indices[i] + 1 == r.count) {
                let mut chosen = None;
                for j in range {
                    if ranks[j] == rank {
                        let cost = motor
                            .cost(codes[j])
                            .ok_or("unsupported motor code")?
                            .upper_ms;
                        if chosen.is_none_or(|(v, c)| cost < v || (cost == v && codes[j] < c)) {
                            chosen = Some((cost, codes[j]));
                        }
                    }
                }
                outcomes[i] = (rank, order, chosen.ok_or("missing motor")?.0);
            } else {
                stage_indices[i] += 1;
                next.push(i);
            }
        }
        active = next;
    }
    if !active.is_empty() {
        return Err("unresolved rows".into());
    }
    let mut tracks: [Track; 4] = std::array::from_fn(|_| Track::default());
    for (i, r) in mode.rows.iter().enumerate() {
        let (rank, len, cost) = outcomes[i];
        let aux = len.saturating_sub(r.base_length);
        let t = &mut tracks[r.kind];
        t.count += 1;
        t.total_weight += r.weight;
        t.motor_upper_ms += r.weight * cost;
        if aux >= 1 {
            t.first_aux_rate += r.weight;
        }
        if aux >= 2 {
            t.second_aux_rate += r.weight;
        }
        if aux >= 3 {
            t.third_aux_rate += r.weight;
        }
        if rank > 1 {
            t.selection_rate += r.weight;
        }
        t.mean_rejected_candidates += r.weight * rank.saturating_sub(1) as f64;
        t.mean_page_actions += r.weight * (rank.saturating_sub(1) / 6) as f64;
        t.mean_keys += r.weight * f64::from(len);
    }
    for t in &mut tracks {
        if t.total_weight <= 0.0 {
            return Err("empty track".into());
        }
        let w = t.total_weight;
        t.motor_upper_ms /= w;
        t.first_aux_rate /= w;
        t.second_aux_rate /= w;
        t.third_aux_rate /= w;
        t.selection_rate /= w;
        t.mean_rejected_candidates /= w;
        t.mean_page_actions /= w;
        t.mean_keys /= w;
        t.effective_ms = t.motor_upper_ms
            + 300.0 * t.first_aux_rate
            + 300.0 * t.second_aux_rate
            + 300.0 * t.third_aux_rate
            + 600.0 * t.selection_rate
            + 50.0 * t.mean_rejected_candidates
            + 300.0 * t.mean_page_actions;
    }
    Ok(tracks)
}
#[derive(Deserialize)]
struct Request {
    id: String,
    state: Vec<u8>,
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = env::args().collect::<Vec<_>>();
    if args.len() != 3 {
        return Err("usage: score-untoned-v51-stream TEMPLATES SNAPSHOT".into());
    }
    let fixture: Fixture = serde_json::from_str(&fs::read_to_string(&args[1])?)?;
    if fixture.version != "untoned-v51-physical-row-templates-1"
        || fixture.tone_keys_by_tone != "IEUAO"
        || fixture.modes.len() != 2
        || fixture.references.len() != 2
        || fixture
            .references
            .iter()
            .any(|r| r.len() != 4 || r.iter().any(|x| !x.is_finite() || *x <= 0.0))
    {
        return Err("unsupported frozen score contract".into());
    }
    let alphabet = KeyAlphabet::new(&fixture.key_alphabet)?;
    if !fixture
        .key_alphabet
        .starts_with("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    {
        return Err("expected uppercase alphabet indices".into());
    }
    let motor = RoleTables::from_snapshot_json(&alphabet, &fs::read_to_string(&args[2])?, 0.0)?;
    let modes = fixture
        .modes
        .into_iter()
        .map(Mode::compile)
        .collect::<Result<Vec<_>, _>>()?;
    println!(
        "{}",
        json!({"ready":true,"rows":modes.iter().map(|m|m.rows.len()).collect::<Vec<_>>()})
    );
    io::stdout().flush()?;
    for line in io::stdin().lock().lines() {
        let request: Request = serde_json::from_str(&line?)?;
        if request.state.len() != 62 || request.state.iter().any(|&k| k >= 26) {
            return Err("state must contain 62 uppercase letter indices".into());
        }
        let start = Instant::now();
        let mut all = Vec::new();
        let mut fourth = 0.0;
        for (m, mode) in modes.iter().enumerate() {
            let tracks = evaluate(mode, &request.state, &motor)?;
            for (kind, weight) in [1.0, 3.0, 1.0, 1.0].into_iter().enumerate() {
                fourth +=
                    weight * (tracks[kind].effective_ms / fixture.references[m][kind]).powi(4);
            }
            all.push(json!({"character":tracks[0],"word2":tracks[1],"word3":tracks[2],"word4":tracks[3]}));
        }
        println!(
            "{}",
            json!({"id":request.id,"score":10.0*(fourth/12.0).powf(0.25),"modes":{"keytao":all[0],"sanpin":all[1]},"seconds":start.elapsed().as_secs_f64()})
        );
        io::stdout().flush()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn soft_page_fill_preserves_groups_and_chunk_boundary() {
        let groups = vec![1, 1, 1, 1, 0, 2, 0, 2];
        assert_eq!(
            balanced_order(&(0..8).collect::<Vec<_>>(), &groups),
            vec![0, 1, 4, 5, 6, 7, 2, 3]
        );
        let mut groups = vec![0; 120];
        groups.extend([1, 2]);
        assert_eq!(
            balanced_order(&(0..122).collect::<Vec<_>>(), &groups),
            (0..122).collect::<Vec<_>>()
        );
    }
    #[test]
    fn singleton_early_winner_leaves_joint_later_pool() {
        assert_eq!(should_finish(1, false), true);
        assert_eq!(should_finish(2, false), false);
        assert_eq!(should_finish(2, true), true);
    }
}
