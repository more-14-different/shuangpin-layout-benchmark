// Keep the independently checked CPU scorer byte-for-byte unchanged.
#[allow(dead_code)]
mod frozen {
    include!("score-untoned-v52-stream.rs");
    use ckt_v4_core::{CudaResolvePlan, Kind, Outcome, Pool, Row, Stage, cuda_device_name};

    fn packed(mode: &Mode, state: &[u8]) -> Result<Vec<u64>, String> {
        let mut all = Vec::with_capacity(mode.codes.len());
        for stage in &mode.stages {
            let mut codes = Vec::with_capacity(stage.count);
            for template in &mode.codes[stage.first_code..stage.first_code + stage.count] {
                let keys = template.tokens[..template.len as usize].iter().map(|&t| {
                    if t < 62 { state[t as usize] } else { t - 62 }
                }).collect::<Vec<_>>();
                codes.push(PackedCode::from_indices(&keys)?.bits());
            }
            codes.sort_unstable();
            if codes.windows(2).any(|p| p[0] == p[1]) { return Err("stage-code alias changes topology".into()); }
            all.extend(codes);
        }
        Ok(all)
    }

    fn rows(mode: &Mode, flat: &[u64]) -> Result<Vec<Row>, String> {
        let mut priorities = vec![0; mode.rows.len()];
        for (priority, &row) in mode.priority.iter().enumerate() { priorities[row] = priority; }
        mode.rows.iter().enumerate().map(|(i, row)| {
            let stages = mode.stages[row.first_stage..row.first_stage + row.count].iter().map(|s| {
                let pool = match (s.pool, s.order) {
                    (0, 2) => Pool::CharBase, (0, 3) => Pool::CharAux1, (0, 4) => Pool::CharAux2,
                    (1, 4) => Pool::WordFour, (1, 5) => Pool::WordFive, (1, 6) => Pool::WordSix,
                    (2, 3) => Pool::Word3Three, (2, 4) => Pool::Word3FourB,
                    (2, 5) => Pool::Word3FiveBb, (2, 6) => Pool::Word3SixBbb,
                    _ => return Err("CUDA adapter only accepts traditional 21x21 pools".to_string()),
                };
                let codes = flat[s.first_code..s.first_code + s.count].iter().map(|&b| PackedCode::from_bits_len(b, s.order)).collect::<Result<Vec<_>, _>>()?;
                Ok(Stage { order: s.order, pool, codes })
            }).collect::<Result<Vec<_>, String>>()?;
            Ok(Row { id: format!("{:09}", priorities[i]), text: String::new(), kind: Kind::ALL[row.kind],
                weight: row.weight, base_length: row.base_length, stages })
        }).collect()
    }

    fn summary(mode: &Mode, outcomes: &[Outcome]) -> Result<[Track; 4], String> {
        if outcomes.len() != mode.rows.len() { return Err("outcome count differs".into()); }
        let mut tracks: [Track; 4] = std::array::from_fn(|_| Track::default());
        for (i, (r, o)) in mode.rows.iter().zip(outcomes).enumerate() {
            if o.row_index != i { return Err("outcome order differs".into()); }
            let t = &mut tracks[r.kind];
            let aux = o.code_length.saturating_sub(r.base_length);
            t.count += 1; t.total_weight += r.weight;
            t.motor_upper_ms += r.weight * o.motor_upper_ms;
            if aux >= 1 { t.first_aux_rate += r.weight; }
            if aux >= 2 { t.second_aux_rate += r.weight; }
            if aux >= 3 { t.third_aux_rate += r.weight; }
            if o.rank > 1 { t.selection_rate += r.weight; }
            t.mean_rejected_candidates += r.weight * o.rank.saturating_sub(1) as f64;
            t.mean_page_actions += r.weight * (o.rank.saturating_sub(1) / 6) as f64;
            t.mean_keys += r.weight * o.code_length as f64;
        }
        for t in &mut tracks {
            let w = t.total_weight;
            if w <= 0.0 { return Err("empty track".into()); }
            t.motor_upper_ms /= w; t.first_aux_rate /= w; t.second_aux_rate /= w;
            t.third_aux_rate /= w; t.selection_rate /= w; t.mean_rejected_candidates /= w;
            t.mean_page_actions /= w; t.mean_keys /= w;
            t.effective_ms = t.motor_upper_ms + 300.0 * (t.first_aux_rate + t.second_aux_rate + t.third_aux_rate)
                + 600.0 * t.selection_rate + 50.0 * t.mean_rejected_candidates + 300.0 * t.mean_page_actions;
        }
        Ok(tracks)
    }

    #[derive(Deserialize)]
    struct BatchRequest { states: Vec<Request>, #[serde(default)] verify: bool }

    pub fn run() -> Result<(), Box<dyn std::error::Error>> {
        let args = env::args().collect::<Vec<_>>();
        if args.len() != 5 || !["cuda", "cpu"].contains(&args[4].as_str()) {
            return Err("usage: score-untoned-v52-cuda-stream TEMPLATES SNAPSHOT ERROR_PROFILE cuda|cpu".into());
        }
        let gpu = args[4] == "cuda";
        let fixture: Fixture = serde_json::from_str(&fs::read_to_string(&args[1])?)?;
        if fixture.version != "untoned-v52-2121-templates-1" || fixture.tone_keys_by_tone != "IVUAO"
            || fixture.modes.len() != 2 || fixture.references.len() != 2 || fixture.references_doubled.len() != 2 {
            return Err("unsupported untoned auxiliary/score contract".into());
        }
        for (one, two) in fixture.references.iter().zip(&fixture.references_doubled) {
            if one.len() != 4 || two.len() != 4 || one.iter().zip(two).any(|(&a, &b)| !a.is_finite() || !b.is_finite() || a <= 0.0 || 2.0*b-a <= 0.0) {
                return Err("invalid reference costs".into());
            }
        }
        let alphabet = KeyAlphabet::new(&fixture.key_alphabet)?;
        let legacy = RoleTables::from_snapshot_json(&alphabet, &fs::read_to_string(&args[2])?, 0.0)?;
        let motor = BlockMotor::new(legacy, &fixture.key_alphabet, &args[3])?;
        let modes = fixture.modes.into_iter().map(Mode::compile).collect::<Result<Vec<_>, _>>()?;
        let mut plans: Vec<Option<CudaResolvePlan>> = vec![None, None];
        let device = if gpu { cuda_device_name()? } else { "CPU".to_string() };
        println!("{}", json!({"ready":true,"backend":args[4],"device":device,"rows":modes.iter().map(|m|m.rows.len()).collect::<Vec<_>>()}));
        io::stdout().flush()?;
        for line in io::stdin().lock().lines() {
            let request: BatchRequest = serde_json::from_str(&line?)?;
            if request.states.is_empty() || request.states.len() > 4 || request.states.iter().any(|r| r.state.len()!=62 || r.state.iter().any(|&k|k>=26)) {
                return Err("batch requires 1..4 states of 62 uppercase indices".into());
            }
            let start = Instant::now();
            let mut all = vec![Vec::<[Track;4]>::new();request.states.len()];
            let mut launches = 0; let mut max_difference = 0.0_f64;
            for (mi, mode) in modes.iter().enumerate() {
                if !gpu {
                    for (i, r) in request.states.iter().enumerate() { all[i].push(evaluate(mode, &r.state, &motor)?); }
                    continue;
                }
                let flat = request.states.iter().map(|r|packed(mode,&r.state)).collect::<Result<Vec<_>,_>>()?;
                if plans[mi].is_none() { plans[mi] = Some(CudaResolvePlan::new(&rows(mode,&flat[0])?)?); }
                let lanes = flat.iter().map(Vec::as_slice).collect::<Vec<_>>();
                let (outcomes, timings) = plans[mi].as_ref().unwrap().resolve_batch_flattened(&lanes, |c|motor.cost(c).ok())?;
                launches += timings.launches;
                for (i, output) in outcomes.iter().enumerate() {
                    let tracks = summary(mode,output)?;
                    if request.verify {
                        let reference = ckt_v4_core::resolve(&rows(mode,&flat[i])?,|c|motor.cost(c).ok())?;
                        if *output != reference { return Err("CUDA/CPU per-outcome mismatch".into()); }
                        let expected = serde_json::to_value(evaluate(mode,&request.states[i].state,&motor)?)?;
                        let actual = serde_json::to_value(&tracks)?;
                        for k in 0..4 { for (field,value) in expected[k].as_object().unwrap() {
                            let d=(actual[k][field].as_f64().unwrap()-value.as_f64().unwrap()).abs();
                            if d>1e-8 { return Err(format!("frozen CPU track mismatch: {mi}/{k}/{field}: {d}").into()); }
                            max_difference=max_difference.max(d);
                        }}
                    }
                    all[i].push(tracks);
                }
            }
            let results = all.iter().zip(&request.states).map(|(tracks,r)| {
                let scores = [1.0,2.0,3.0].map(|multiple| {
                    let mut fourth=0.0;
                    for mi in 0..2 { for (ki,weight) in [1.0,3.0,1.0,1.0].into_iter().enumerate() {
                        let t=&tracks[mi][ki]; let effective=multiple*t.effective_ms-(multiple-1.0)*t.motor_upper_ms;
                        let reference=fixture.references[mi][ki]+(multiple-1.0)*(fixture.references_doubled[mi][ki]-fixture.references[mi][ki]);
                        fourth+=weight*(effective/reference).powi(4);
                    }}
                    10.0*(fourth/12.0).powf(0.25)
                });
                let mode_json=|m:usize|json!({"character":tracks[m][0],"word2":tracks[m][1],"word3":tracks[m][2],"word4":tracks[m][3]});
                json!({"id":r.id,"scores":scores,"modes":{"keytao":mode_json(0),"sanpin":mode_json(1)}})
            }).collect::<Vec<_>>();
            println!("{}",json!({"results":results,"verified":request.verify||!gpu,"cudaLaunches":launches,"maxTrackDifference":max_difference,"seconds":start.elapsed().as_secs_f64()}));
            io::stdout().flush()?;
        }
        Ok(())
    }
}
fn main() -> Result<(),Box<dyn std::error::Error>> { frozen::run() }
