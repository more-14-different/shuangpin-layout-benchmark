param(
    [ValidateSet('Run','Audit','Smoke','Build')][string]$Mode = 'Run',
    [string]$Output = 'research/.cache/cr-anneal',
    [int64]$Seed = 20261113,
    [ValidateRange(0.01,1.0)][double]$Duty = 0.25,
    [ValidateRange(1,4)][int]$Batch = 2,
    [ValidateRange(1,8)][int]$Threads = 2,
    [double]$Hours = 0,
    [int]$Rounds = 0,
    [switch]$FixedFirst
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $repo
try {
    foreach ($tool in @('cargo','python','nvcc','nvidia-smi')) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Missing tool on PATH: $tool" }
    }
    & cargo build --locked --release --features cuda --jobs 2 --manifest-path research/ckt-v4-core/Cargo.toml --bin score-toned-stream
    if ($LASTEXITCODE -ne 0) { throw 'CUDA scorer build failed' }
    if ($Mode -eq 'Build') { return }
    $invariant = [Globalization.CultureInfo]::InvariantCulture
    $arguments = @('tools/run_cr_anneal.py','--backend','cuda','--output',$Output,
        '--seed',"$Seed",'--duty',$Duty.ToString($invariant),'--batch',"$Batch",'--threads',"$Threads",
        '--hours',$Hours.ToString($invariant),'--rounds',"$Rounds")
    if ($FixedFirst) { $arguments += '--fixed-first' }
    if ($Mode -eq 'Audit') { $arguments += '--audit-only' }
    if ($Mode -eq 'Smoke') { $arguments += @('--rounds','16') }
    & python @arguments
    if ($LASTEXITCODE -ne 0) { throw "Annealing stopped with error $LASTEXITCODE; retain the output directory for diagnosis/resume" }
} finally { Pop-Location }
