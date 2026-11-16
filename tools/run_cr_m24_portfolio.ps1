param(
    [ValidateSet('Run','Audit','Smoke','Build')][string]$Mode = 'Run',
    [string]$Output = 'research/.cache/cr-m24-portfolio',
    [int64]$Seed = 2026111701,
    [ValidateRange(0.01,1.0)][double]$Duty = 0.25,
    [ValidateRange(1,4)][int]$Batch = 2,
    [ValidateRange(1,8)][int]$Threads = 2,
    [double]$Hours = 0,
    [int]$Rounds = 0,
    [ValidateRange(1,1000000)][int]$Cycle = 5000,
    [double]$Temperature = 0.025,
    [int]$Device = 0
)
$ErrorActionPreference = 'Stop'
$taskRepo = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $taskRepo
try {
    foreach ($taskTool in @('cargo','python','nvcc','nvidia-smi')) {
        if (-not (Get-Command $taskTool -ErrorAction SilentlyContinue)) { throw "Missing tool on PATH: $taskTool" }
    }
    & cargo build --locked --release --features cuda --jobs 2 --manifest-path research/ckt-v4-core/Cargo.toml --bin score-toned-stream
    if ($LASTEXITCODE -ne 0) { throw 'CUDA scorer build failed' }
    if ($Mode -eq 'Build') { return }
    $taskInvariant = [Globalization.CultureInfo]::InvariantCulture
    $taskArguments = @('-X','utf8','tools/run_cr_m24_portfolio.py','--backend','cuda','--output',$Output,
        '--seed',"$Seed",'--duty',$Duty.ToString($taskInvariant),'--batch',"$Batch",'--threads',"$Threads",
        '--hours',$Hours.ToString($taskInvariant),'--cycle',"$Cycle",'--temp',$Temperature.ToString($taskInvariant),'--device',"$Device")
    if ($Mode -eq 'Audit') { $taskArguments += '--audit-only' }
    elseif ($Mode -eq 'Smoke') { $taskArguments += @('--rounds','16') }
    else { $taskArguments += @('--rounds',"$Rounds") }
    & python @taskArguments
    if ($LASTEXITCODE -ne 0) { throw "Portfolio stopped with error $LASTEXITCODE; retain its output directory for diagnosis/resume" }
} finally { Pop-Location }
