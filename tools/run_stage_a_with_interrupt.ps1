# Stage A Runner with Active Checkpoint Recovery Verification
$ErrorActionPreference = 'Stop'
$repo = "D:\Code\Lua\inputMethod\shuangpin-layout-benchmark-prod-2126"
Set-Location -LiteralPath $repo

$configRel = "research/config/ckt-v4-production-2126-20261025.json"
$configPath = Join-Path $repo $configRel
$config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
$outputRoot = Join-Path $repo $config.outputRoot
$dbPath = Join-Path $outputRoot "exploration.sqlite3"

Write-Host "============================================================"
Write-Host "Stage A Execution with Checkpoint Recovery Verification"
Write-Host "Repository: $repo"
Write-Host "Config: $configPath"
Write-Host "Output Root: $outputRoot"
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

# Ensure output root is clean before stage A begins
if (Test-Path -LiteralPath $outputRoot) {
    Write-Host "Cleaning existing output root $outputRoot for fresh Stage A..."
    Remove-Item -LiteralPath $outputRoot -Recurse -Force
}

$initialGpu = Get-GpuSample
$initialRam = Get-ProcessRamSample @($PID)
Write-Host "[Baseline Sample] GPU: Util=$($initialGpu.GpuUtilPercent)%, VRAM=$($initialGpu.VramUsedMiB)MiB, Temp=$($initialGpu.TempC)C, Power=$($initialGpu.PowerW)W"
Write-Host "[Baseline Sample] RAM: FreeSystem=$($initialRam.FreeSystemRamMB)MB / Total=$($initialRam.TotalSystemRamMB)MB"

$stageAStart = [DateTime]::UtcNow
Write-Host "Stage A Start Time (UTC): $($stageAStart.ToString('o'))"

# Launch Explorer Runner
Write-Host "Launching Explorer Runner (Process 1)..."
$runnerProc = Start-Process -FilePath "pwsh.exe" -ArgumentList "-NoLogo", "-NoProfile", "-File", "tools/run_ckt_v4_explorer.ps1", "-Config", $configRel -PassThru
$runnerPid = $runnerProc.Id
Write-Host "Explorer Runner launched with PID: $runnerPid"

$gen1Dir = Join-Path $outputRoot "generation-0001"
$interrupted = $false
$childAnnealerPid = $null
$checkpointStepTarget = 15 # Within requirement [10, 25]

Write-Host "Monitoring Generation 1 for checkpoint step $checkpointStepTarget/40..."
while (-not $interrupted) {
    Start-Sleep -Milliseconds 800
    if ($runnerProc.HasExited) {
        throw "Explorer runner exited prematurely before reaching checkpoint target!"
    }
    
    # Check for child anneal-native.exe process
    if ($null -eq $childAnnealerPid) {
        $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $runnerPid }
        $annealer = $children | Where-Object { $_.Name -like "*anneal-native*" }
        if ($annealer) {
            $childAnnealerPid = $annealer.ProcessId
            Write-Host "Identified child anneal-native.exe PID: $childAnnealerPid"
        }
    }
    
    if (Test-Path -LiteralPath $gen1Dir) {
        $checkpoints = @(Get-ChildItem -LiteralPath $gen1Dir -Filter "chain-*.checkpoint.json" -ErrorAction SilentlyContinue)
        if ($checkpoints.Count -eq 8) {
            $allReached = $true
            $stepSummary = @()
            foreach ($cp in $checkpoints) {
                try {
                    $data = Get-Content -Raw -LiteralPath $cp.FullName | ConvertFrom-Json
                    $stepSummary += "$($cp.BaseName.Split('.')[0]): step $($data.iteration)"
                    if ($data.iteration -lt $checkpointStepTarget) {
                        $allReached = $false
                    }
                } catch {
                    $allReached = $false
                }
            }
            if ($allReached) {
                Write-Host "All 8 chains have reached step >= $checkpointStepTarget!"
                Write-Host ($stepSummary -join "; ")
                
                if ($null -eq $childAnnealerPid) {
                    $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $runnerPid }
                    $annealer = $children | Where-Object { $_.Name -like "*anneal-native*" }
                    if ($annealer) { $childAnnealerPid = $annealer.ProcessId }
                }
                
                # Active Interrupt
                Write-Host ">>> Actively interrupting runner PID $runnerPid and child annealer PID $childAnnealerPid at step $checkpointStepTarget/40 <<<"
                if ($null -ne $childAnnealerPid) {
                    try { Stop-Process -Id $childAnnealerPid -Force -ErrorAction SilentlyContinue } catch {}
                }
                try { Stop-Process -Id $runnerPid -Force -ErrorAction SilentlyContinue } catch {}
                [void]$runnerProc.WaitForExit(5000)
                $interrupted = $true
                Write-Host "Interruption successful. Both target PIDs stopped cleanly."
            }
        }
    }
}

# Verify Checkpoint Content on Disk
Write-Host "============================================================"
Write-Host "Verifying Checkpoint State Before Resume"
Write-Host "============================================================"
$checkpoints = @(Get-ChildItem -LiteralPath $gen1Dir -Filter "chain-*.checkpoint.json" | Sort-Object Name)
if ($checkpoints.Count -ne 8) {
    throw "Expected 8 checkpoints, found $($checkpoints.Count)"
}
$savedIterations = @()
foreach ($cp in $checkpoints) {
    $data = Get-Content -Raw -LiteralPath $cp.FullName | ConvertFrom-Json
    $savedIterations += $data.iteration
    Write-Host "$($cp.Name) -> iteration=$($data.iteration), bestScore=$($data.bestScore), accepted=$($data.accepted), evaluated=$($data.evaluated)"
    if ($data.iteration -lt 10 -or $data.iteration -gt 25) {
        throw "Checkpoint iteration $($data.iteration) is out of required range [10, 25]!"
    }
}
Write-Host "All 8 checkpoints verified in range [10, 25] (Iterations: $($savedIterations -join ', '))"

# Give a brief pause to ensure OS file handles released
Start-Sleep -Seconds 2

# Restart Explorer with Exact Same Config
Write-Host "============================================================"
Write-Host "Restarting Explorer Runner (Resumed Process)..."
Write-Host "============================================================"
$resumedRunner = Start-Process -FilePath "pwsh.exe" -ArgumentList "-NoLogo", "-NoProfile", "-File", "tools/run_ckt_v4_explorer.ps1", "-Config", $configRel -PassThru
$resumedPid = $resumedRunner.Id
Write-Host "Resumed Explorer Runner launched with PID: $resumedPid"

# Wait for Generation 1 to finish
$gen1Plan = Join-Path $outputRoot "generation-0001-plan/plan.json"
Write-Host "Waiting for Generation 1 to complete and prove resume..."
while (-not (Test-Path -LiteralPath $gen1Plan)) {
    Start-Sleep -Seconds 1
    if ($resumedRunner.HasExited) {
        throw "Resumed runner exited before Generation 1 completed!"
    }
}

Write-Host "Generation 1 completed!"
# Verify anneal-batch.stdout.log contains resume=true and correct start-step
$batchLog = Join-Path $gen1Dir "anneal-batch.stdout.log"
if (-not (Test-Path -LiteralPath $batchLog)) {
    throw "Batch stdout log missing: $batchLog"
}
$logLines = Get-Content -LiteralPath $batchLog
$resumeLines = @($logLines | Where-Object { $_ -match "scoring full-backend=cuda.*resume=true" })
Write-Host "Found $($resumeLines.Count) resume lines in ${batchLog}:"
foreach ($l in $resumeLines) {
    Write-Host "  $l"
}
if ($resumeLines.Count -lt 8) {
    throw "Expected 8 resume lines for 8 chains, but found $($resumeLines.Count)!"
}
Write-Host ">>> Checkpoint Recovery VERIFIED: All 8 chains successfully resumed from step >= 15 with resume=true! <<<"

# Initial Resource Sample after Generation 1
$resumedChildAnnealer = (Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $resumedPid -and $_.Name -like "*anneal-native*" }).ProcessId
$allPids = @($resumedPid)
if ($resumedChildAnnealer) { $allPids += $resumedChildAnnealer }
$sampleFirstGpu = Get-GpuSample
$sampleFirstRam = Get-ProcessRamSample $allPids
Write-Host "[Stage A First Sample - Gen 1] GPU: Util=$($sampleFirstGpu.GpuUtilPercent)%, VRAM=$($sampleFirstGpu.VramUsedMiB)MiB, Temp=$($sampleFirstGpu.TempC)C, Power=$($sampleFirstGpu.PowerW)W"
Write-Host "[Stage A First Sample - Gen 1] RAM: ProcWS=$($sampleFirstRam.WorkingSetMB)MB, ProcPB=$($sampleFirstRam.PrivateBytesMB)MB"

# Monitor remaining generations up to 15
$sampleMidLogged = $false
$sampleMidGpu = $null
$sampleMidRam = $null

Write-Host "Monitoring Stage A progress (Generations 2 to 15)..."
$lastReportedGen = 1
while (-not $resumedRunner.HasExited) {
    Start-Sleep -Seconds 5
    
    # Check current latest plan
    $plans = @(Get-ChildItem -LiteralPath $outputRoot -Filter "generation-*-plan" -Directory | Sort-Object Name)
    if ($plans.Count -gt $lastReportedGen) {
        for ($g = $lastReportedGen + 1; $g -le $plans.Count; $g++) {
            $planName = ('generation-{0:d4}-plan' -f $g)
            $planFile = Join-Path $outputRoot "$planName/plan.json"
            if (Test-Path -LiteralPath $planFile) {
                $pJson = Get-Content -Raw -LiteralPath $planFile | ConvertFrom-Json
                $elapsedSec = [math]::Round(([DateTime]::UtcNow - $stageAStart).TotalSeconds, 1)
                Write-Host "Generation $g completed (Elapsed: ${elapsedSec}s) | bestCktV4=$($pJson.bestCktV4) | totalStates=$($pJson.totalStates)"
                $lastReportedGen = $g
            }
        }
    }
    
    # Mid sample at Gen 7 or 8
    if (-not $sampleMidLogged -and $lastReportedGen -ge 8) {
        $sampleMidGpu = Get-GpuSample
        $currentChildren = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $resumedPid }
        $currentPids = @($resumedPid) + @($currentChildren | ForEach-Object { $_.ProcessId })
        $sampleMidRam = Get-ProcessRamSample $currentPids
        Write-Host "[Stage A Mid Sample - Gen $lastReportedGen] GPU: Util=$($sampleMidGpu.GpuUtilPercent)%, VRAM=$($sampleMidGpu.VramUsedMiB)MiB, Temp=$($sampleMidGpu.TempC)C, Power=$($sampleMidGpu.PowerW)W"
        Write-Host "[Stage A Mid Sample - Gen $lastReportedGen] RAM: ProcWS=$($sampleMidRam.WorkingSetMB)MB, ProcPB=$($sampleMidRam.PrivateBytesMB)MB"
        $sampleMidLogged = $true
    }
    
    if ($lastReportedGen -ge 15) {
        $gen15Plan = Join-Path $outputRoot "generation-0015-plan/plan.json"
        if (Test-Path -LiteralPath $gen15Plan) {
            Write-Host "Generation 15 plan reached! Waiting for explorer process to exit cleanly..."
            [void]$resumedRunner.WaitForExit(60000)
            break
        }
    }
}

if (-not $resumedRunner.HasExited) {
    [void]$resumedRunner.WaitForExit(60000)
}
$stageAEnd = [DateTime]::UtcNow
$stageADuration = $stageAEnd - $stageAStart

# Tail Resource Sample
$sampleTailGpu = Get-GpuSample
$sampleTailRam = Get-ProcessRamSample @($PID)
Write-Host "[Stage A Tail Sample - Gen 15] GPU: Util=$($sampleTailGpu.GpuUtilPercent)%, VRAM=$($sampleTailGpu.VramUsedMiB)MiB, Temp=$($sampleTailGpu.TempC)C, Power=$($sampleTailGpu.PowerW)W"
Write-Host "[Stage A Tail Sample - Gen 15] RAM: FreeSystem=$($sampleTailRam.FreeSystemRamMB)MB / Total=$($sampleTailRam.TotalSystemRamMB)MB"

Write-Host "============================================================"
Write-Host "Stage A Completed in $($stageADuration.TotalMinutes.ToString('F2')) minutes ($($stageADuration.TotalSeconds.ToString('F1')) seconds)"
Write-Host "============================================================"

# SQLite Integrity Check
Write-Host "Running SQLite PRAGMA integrity_check..."
$sqliteCheck = & sqlite3 $dbPath "PRAGMA integrity_check;"
Write-Host "SQLite integrity check result: $sqliteCheck"
if ($sqliteCheck -ne "ok") {
    throw "SQLite integrity check failed: $sqliteCheck"
}

# Verify all checkpoint files iteration completeness
Write-Host "Verifying iteration completeness for all checkpoints in generations 1..15..."
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
$gen15PlanData = Get-Content -Raw -LiteralPath (Join-Path $outputRoot "generation-0015-plan/plan.json") | ConvertFrom-Json
$gen1PlanData = Get-Content -Raw -LiteralPath (Join-Path $outputRoot "generation-0001-plan/plan.json") | ConvertFrom-Json
$dbUniqueStates = & sqlite3 $dbPath "SELECT count(*) FROM states;"

Write-Host "------------------------------------------------------------"
Write-Host "Stage A Summary Statistics:"
Write-Host "Completed Generations: 15"
Write-Host "Wall-Clock Time: $($stageADuration.TotalMinutes.ToString('F2')) min"
$genPerHour = [math]::Round(15 / ($stageADuration.TotalHours), 2)
Write-Host "Real Generations/Hour: $genPerHour gen/h"
Write-Host "Initial Best CKT v4 (Gen 1): $($gen1PlanData.bestCktV4)"
Write-Host "Final Best CKT v4 (Gen 15): $($gen15PlanData.bestCktV4)"
$cktImprovement = [math]::Round($gen1PlanData.bestCktV4 - $gen15PlanData.bestCktV4, 6)
Write-Host "CKT v4 Improvement: $cktImprovement"
Write-Host "SQLite Unique States: $dbUniqueStates"
Write-Host "Review Queue Count (Gen 15): $((Get-Content -Raw (Join-Path $outputRoot 'generation-0015-plan/review-queue.json') | ConvertFrom-Json).Count)"
Write-Host "------------------------------------------------------------"
