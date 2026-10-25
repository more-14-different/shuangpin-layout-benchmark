# Stage B Execution & Monitoring Runner
$ErrorActionPreference = 'Stop'
$repo = "D:\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2126"
Set-Location -LiteralPath $repo

$configRel = "research/config/ckt-v4-production-2126-20261025.json"
$configPath = Join-Path $repo $configRel
$config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
$outputRoot = Join-Path $repo $config.outputRoot
$dbPath = Join-Path $outputRoot "exploration.sqlite3"

Write-Host "============================================================"
Write-Host "Stage B Execution: In-Place Resume to Cumulative 90 Generations"
Write-Host "Repository: $repo"
Write-Host "Config: $configPath"
Write-Host "Output Root: $outputRoot"
Write-Host "Target Total Generations: $($config.generations)"
Write-Host "============================================================"

# Helper function to get GPU stats
function Get-GpuSample {
    try {
        $out = & nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw --format=csv,noheader,nounits 2>&1
        $parts = $out.Split(',') | ForEach-Object { $_.Trim() }
        [pscustomobject]@{
            GpuUtilPercent = [int]$parts[0]
            VramUsedMiB    = [int]$parts[1]
            VramTotalMiB   = [int]$parts[2]
            TempC          = [int]$parts[3]
            PowerW         = [double]$parts[4]
        }
    } catch {
        $null
    }
}

# Helper function to get RAM stats for task processes
function Get-ProcessRamSample([int[]]$Pids) {
    $totalWs = 0
    $totalPb = 0
    foreach ($p in $Pids) {
        $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
        if ($proc) {
            $totalWs += $proc.WorkingSet64
            $totalPb += $proc.PrivateMemorySize64
        }
    }
    $os = Get-CimInstance Win32_OperatingSystem
    [pscustomobject]@{
        WorkingSetMB = [math]::Round($totalWs / 1MB, 2)
        PrivateBytesMB = [math]::Round($totalPb / 1MB, 2)
        FreeSystemRamMB = [math]::Round($os.FreePhysicalMemory / 1024, 2)
        TotalSystemRamMB = [math]::Round($os.TotalVisibleMemorySize / 1024, 2)
    }
}

$stageBStart = [DateTime]::UtcNow
Write-Host "Stage B Start Time (UTC): $($stageBStart.ToString('o'))"

$initialGpu = Get-GpuSample
$initialRam = Get-ProcessRamSample @($PID)
Write-Host "[Stage B Start Baseline] GPU: Util=$($initialGpu.GpuUtilPercent)%, VRAM=$($initialGpu.VramUsedMiB)MiB, Temp=$($initialGpu.TempC)C, Power=$($initialGpu.PowerW)W"
Write-Host "[Stage B Start Baseline] RAM: FreeSystem=$($initialRam.FreeSystemRamMB)MB / Total=$($initialRam.TotalSystemRamMB)MB"

# Launch Explorer Runner
Write-Host "Launching Explorer Runner for Stage B..."
$runnerProc = Start-Process -FilePath "pwsh.exe" -ArgumentList "-NoLogo", "-NoProfile", "-File", "tools/run_ckt_v4_explorer.ps1", "-Config", $configRel -PassThru
$runnerPid = $runnerProc.Id
Write-Host "Explorer Runner PID: $runnerPid"

$lastReportedGen = 15
$midSampleLogged = $false
$midGenTarget = 52 # Midpoint of Stage B (between 15 and 90)

while (-not $runnerProc.HasExited) {
    Start-Sleep -Seconds 10
    
    # Identify child anneal-native PID if not known
    $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $runnerPid }
    $currentPids = @($runnerPid) + @($children | ForEach-Object { $_.ProcessId })
    
    # Check plans
    $plans = @(Get-ChildItem -LiteralPath $outputRoot -Filter "generation-*-plan" -Directory | Sort-Object Name)
    if ($plans.Count -gt $lastReportedGen) {
        for ($g = $lastReportedGen + 1; $g -le $plans.Count; $g++) {
            $planName = ('generation-{0:d4}-plan' -f $g)
            $planFile = Join-Path $outputRoot "$planName/plan.json"
            if (Test-Path -LiteralPath $planFile) {
                $pJson = Get-Content -Raw -LiteralPath $planFile | ConvertFrom-Json
                $elapsedSec = [math]::Round(([DateTime]::UtcNow - $stageBStart).TotalSeconds, 1)
                Write-Host "Generation $g completed (Stage B Elapsed: ${elapsedSec}s) | bestCktV4=$($pJson.bestCktV4) | totalStates=$($pJson.totalStates)"
                $lastReportedGen = $g
                
                # Sample resources every 15 generations or at mid target
                if ($g -eq 16 -or ($g % 15 -eq 0) -or ($g -ge $midGenTarget -and -not $midSampleLogged)) {
                    $gpu = Get-GpuSample
                    $ram = Get-ProcessRamSample $currentPids
                    $sampleLabel = if ($g -ge $midGenTarget -and -not $midSampleLogged) { "Stage B Mid Sample (Gen $g)" } else { "Periodic Sample (Gen $g)" }
                    Write-Host "[$sampleLabel] GPU: Util=$($gpu.GpuUtilPercent)%, VRAM=$($gpu.VramUsedMiB)MiB, Temp=$($gpu.TempC)C, Power=$($gpu.PowerW)W | RAM: WS=$($ram.WorkingSetMB)MB, PB=$($ram.PrivateBytesMB)MB"
                    if ($g -ge $midGenTarget) { $midSampleLogged = $true }
                }
            }
        }
    }
    
    if ($lastReportedGen -ge 90) {
        $gen90Plan = Join-Path $outputRoot "generation-0090-plan/plan.json"
        if (Test-Path -LiteralPath $gen90Plan) {
            Write-Host "Generation 90 plan reached! Waiting for explorer process to exit cleanly..."
            [void]$runnerProc.WaitForExit(60000)
            break
        }
    }
}

if (-not $runnerProc.HasExited) {
    [void]$runnerProc.WaitForExit(60000)
}

$stageBEnd = [DateTime]::UtcNow
$stageBDuration = $stageBEnd - $stageBStart

# Tail Sample
$tailGpu = Get-GpuSample
$tailRam = Get-ProcessRamSample @($PID)
Write-Host "[Stage B Tail Sample - Gen 90] GPU: Util=$($tailGpu.GpuUtilPercent)%, VRAM=$($tailGpu.VramUsedMiB)MiB, Temp=$($tailGpu.TempC)C, Power=$($tailGpu.PowerW)W"
Write-Host "[Stage B Tail Sample - Gen 90] RAM: FreeSystem=$($tailRam.FreeSystemRamMB)MB / Total=$($tailRam.TotalSystemRamMB)MB"

Write-Host "============================================================"
Write-Host "Stage B Execution Finished in $($stageBDuration.TotalMinutes.ToString('F2')) minutes ($($stageBDuration.TotalSeconds.ToString('F1')) seconds)"
Write-Host "============================================================"

# SQLite Integrity Check
Write-Host "Running SQLite PRAGMA integrity_check..."
$sqliteCheck = & sqlite3 $dbPath "PRAGMA integrity_check;"
Write-Host "SQLite integrity check result: $sqliteCheck"
if ($sqliteCheck -ne "ok") {
    throw "SQLite integrity check failed: $sqliteCheck"
}

# Verify Checkpoint Completeness (Generations 1..90)
Write-Host "Verifying iteration completeness for all checkpoints across generations 1..90..."
$allCheckpoints = @(Get-ChildItem -LiteralPath $outputRoot -Recurse -Filter "chain-*.checkpoint.json")
Write-Host "Found $($allCheckpoints.Count) checkpoints across all generations."
$incompleteCheckpoints = @()
foreach ($cp in $allCheckpoints) {
    $cpData = Get-Content -Raw -LiteralPath $cp.FullName | ConvertFrom-Json
    if ($cpData.iteration -ne 40) {
        $incompleteCheckpoints += "$($cp.FullName) (iteration=$($cpData.iteration))"
    }
}
if ($incompleteCheckpoints.Count -gt 0) {
    throw "Found incomplete checkpoints: $($incompleteCheckpoints -join '; ')"
}
Write-Host "All $($allCheckpoints.Count) checkpoints completed exactly 40/40 steps!"

# Final Summary Metrics
$gen90PlanData = Get-Content -Raw -LiteralPath (Join-Path $outputRoot "generation-0090-plan/plan.json") | ConvertFrom-Json
$gen15PlanData = Get-Content -Raw -LiteralPath (Join-Path $outputRoot "generation-0015-plan/plan.json") | ConvertFrom-Json
$gen1PlanData = Get-Content -Raw -LiteralPath (Join-Path $outputRoot "generation-0001-plan/plan.json") | ConvertFrom-Json
$dbUniqueStates = & sqlite3 $dbPath "SELECT count(*) FROM states;"

Write-Host "------------------------------------------------------------"
Write-Host "Stage B Cumulative Summary Statistics:"
Write-Host "Total Completed Generations: 90"
Write-Host "Stage B Wall-Clock Time: $($stageBDuration.TotalMinutes.ToString('F2')) min"
$cumulativeDurationMin = $stageBDuration.TotalMinutes + 25.25
Write-Host "Cumulative All-Stage Wall-Clock Time: $($cumulativeDurationMin.ToString('F2')) min ($([math]::Round($cumulativeDurationMin / 60, 2)) hours)"
$genPerHour = [math]::Round(75 / ($stageBDuration.TotalHours), 2)
$overallGenPerHour = [math]::Round(90 / ($cumulativeDurationMin / 60), 2)
Write-Host "Stage B Gen/Hour: $genPerHour gen/h | Overall Cumulative Gen/Hour: $overallGenPerHour gen/h"
Write-Host "Start Best CKT v4 (Gen 1): $($gen1PlanData.bestCktV4)"
Write-Host "Stage A Best CKT v4 (Gen 15): $($gen15PlanData.bestCktV4)"
Write-Host "Final Best CKT v4 (Gen 90): $($gen90PlanData.bestCktV4)"
$overallImprovement = [math]::Round($gen1PlanData.bestCktV4 - $gen90PlanData.bestCktV4, 6)
$stageBImprovement = [math]::Round($gen15PlanData.bestCktV4 - $gen90PlanData.bestCktV4, 6)
Write-Host "Stage B CKT v4 Improvement: $stageBImprovement | Overall Improvement: $overallImprovement"
Write-Host "SQLite Unique States: $dbUniqueStates"
Write-Host "Review Queue Count (Gen 90): $((Get-Content -Raw (Join-Path $outputRoot 'generation-0090-plan/review-queue.json') | ConvertFrom-Json).Count)"
Write-Host "------------------------------------------------------------"
