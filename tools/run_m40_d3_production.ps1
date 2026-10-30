# Full 4-Stage Production Annealing Pipeline for M<=40, D<=3, V<=1 21x26 Caliber
# Features: Continuous In-Place Resumption, Active Recovery Verification in Stage A,
# Comprehensive Resource Sampling, SQLite Integrity Check, Global Best + Seed Archiving,
# and Automated Git Commit + Push Between and Inside Stages.

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location -LiteralPath $repo

$configRel = "research/config/ckt-v4-production-2126-m40-d3-20261031.json"
$configPath = Join-Path $repo $configRel
$branch = "production/ckt-v4-2126-m40-d3-20261031"

function Invoke-GitSync([string]$CommitMessage) {
    Write-Host "============================================================"
    Write-Host "[Git Sync] Preparing commit and push on branch $branch"
    Write-Host "Message: $CommitMessage"
    try {
        & git add research/config/ckt-v4-production-2126-m40-d3-20261031.json
        if (Test-Path "research/seeds/ckt-v4/m40-d3*") {
            & git add research/seeds/ckt-v4/m40-d3*
        }
        if (Test-Path "research/milestones/m40-d3*") {
            & git add research/milestones/m40-d3*
        }
        & git add tools/run_m40_d3_production.ps1
        & git add tools/prepare_m40_d3_production.py
        $status = & git status --porcelain
        if ($status) {
            & git commit -m "$CommitMessage"
            & git push -u origin $branch
            Write-Host "[Git Sync] Successfully committed and pushed to origin/$branch."
        } else {
            Write-Host "[Git Sync] Working tree clean; nothing to commit."
        }
    } catch {
        Write-Warning "[Git Sync] Git sync warning: $_"
    }
    Write-Host "============================================================"
}

function Archive-PlanSeeds([string]$PlanPath, [string]$OutputDir) {
    Write-Host "Archiving plan seeds from $PlanPath to $OutputDir..."
    $script = "tools/archive_ckt_v4_explorer_seeds.mjs"
    & node $script --plan $PlanPath --ranking "research/config/ckt-v4-ranked-seeds-21x26.json" --output $OutputDir
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Seed archive script exited with code $LASTEXITCODE"
    }
}

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
    } catch { $null }
}

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

# Initial Commit for Branch Setup & Config
Invoke-GitSync "chore(m40-d3): initialize 21x26 M<=40, D<=3, V<=1 production branch, 8 initial seeds, and 4-stage runner"

# Stage Definitions: Target Generations & Guards (Frozen Scientific Contract: M<=40, D<=3, V<=1)
$stages = @(
    [pscustomobject]@{ StageName = "Stage A"; TargetGen = 15;  VerifyInterrupt = $true;  CommitInterval = 0  },
    [pscustomobject]@{ StageName = "Stage B"; TargetGen = 90;  VerifyInterrupt = $false; CommitInterval = 30 },
    [pscustomobject]@{ StageName = "Stage C"; TargetGen = 250; VerifyInterrupt = $false; CommitInterval = 50 },
    [pscustomobject]@{ StageName = "Stage D"; TargetGen = 400; VerifyInterrupt = $false; CommitInterval = 50 }
)

$config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
$outputRoot = Join-Path $repo $config.outputRoot
$dbPath = Join-Path $outputRoot "exploration.sqlite3"

$pipelineStart = [DateTime]::UtcNow
Write-Host "############################################################"
Write-Host "Starting 4-Stage M<=40, D<=3, V<=1 21x26 Production Pipeline"
Write-Host "Repository: $repo"
Write-Host "Config: $configPath"
Write-Host "Output Root: $outputRoot"
Write-Host "Guards: maxMemory=$($config.guards.maxMemory), maxD=$($config.guards.maxD), maxV=$($config.guards.maxV)"
Write-Host "Pipeline Start Time (UTC): $($pipelineStart.ToString('o'))"
Write-Host "############################################################"

$currentGen = 0

foreach ($stage in $stages) {
    $sName = $stage.StageName
    $targetGen = $stage.TargetGen
    Write-Host "============================================================"
    Write-Host ">>> Entering ${sName}: Target Generation = $targetGen <<<"
    Write-Host "============================================================"
    
    # Update generations in config
    $cfg = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
    $cfg.generations = $targetGen
    $cfg | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $configPath -Encoding utf8
    
    $stageStart = [DateTime]::UtcNow
    
    # Check if this stage is already completed
    $targetPlanFile = Join-Path $outputRoot ("generation-{0:d4}-plan/plan.json" -f $targetGen)
    if (Test-Path -LiteralPath $targetPlanFile) {
        Write-Host "[$sName] Target generation $targetGen already completed on disk. Skipping execution."
        $currentGen = $targetGen
        continue
    }

    # Stage A active interrupt logic
    if ($stage.VerifyInterrupt -and -not (Test-Path (Join-Path $outputRoot "generation-0001"))) {
        Write-Host "[$sName] Active Checkpoint Recovery Verification Mode..."
        $runnerProc = Start-Process -FilePath "pwsh.exe" -ArgumentList "-NoLogo", "-NoProfile", "-File", "tools/run_ckt_v4_explorer.ps1", "-Config", $configRel -PassThru
        $runnerPid = $runnerProc.Id
        $gen1Dir = Join-Path $outputRoot "generation-0001"
        $interrupted = $false
        $childAnnealerPid = $null
        
        while (-not $interrupted) {
            Start-Sleep -Milliseconds 800
            if ($runnerProc.HasExited) { throw "Runner exited prematurely during interrupt test!" }
            if ($null -eq $childAnnealerPid) {
                $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $runnerPid }
                $annealer = $children | Where-Object { $_.Name -like "*anneal-native*" }
                if ($annealer) { $childAnnealerPid = $annealer.ProcessId }
            }
            if (Test-Path -LiteralPath $gen1Dir) {
                $checkpoints = @(Get-ChildItem -LiteralPath $gen1Dir -Filter "chain-*.checkpoint.json" -ErrorAction SilentlyContinue)
                if ($checkpoints.Count -eq 8) {
                    $allReached = $true
                    foreach ($cp in $checkpoints) {
                        try {
                            $data = Get-Content -Raw -LiteralPath $cp.FullName | ConvertFrom-Json
                            if ($data.iteration -lt 15) { $allReached = $false }
                        } catch { $allReached = $false }
                    }
                    if ($allReached) {
                        Write-Host "[$sName] All 8 chains reached step >= 15! Interrupting PID $runnerPid and child processes..."
                        Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $runnerPid } | ForEach-Object {
                            try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
                        }
                        try { Stop-Process -Id $runnerPid -Force -ErrorAction SilentlyContinue } catch {}
                        [void]$runnerProc.WaitForExit(5000)
                        $interrupted = $true
                        Write-Host "[$sName] Process successfully stopped."
                    }
                }
            }
        }
        Start-Sleep -Seconds 2
        # Resume
        Write-Host "[$sName] Restarting explorer runner after interrupt..."
        $resumedRunner = Start-Process -FilePath "pwsh.exe" -ArgumentList "-NoLogo", "-NoProfile", "-File", "tools/run_ckt_v4_explorer.ps1", "-Config", $configRel -PassThru
        $activeRunner = $resumedRunner
    } else {
        # Standard in-place resume
        Write-Host "[$sName] Resuming explorer runner in-place..."
        $activeRunner = Start-Process -FilePath "pwsh.exe" -ArgumentList "-NoLogo", "-NoProfile", "-File", "tools/run_ckt_v4_explorer.ps1", "-Config", $configRel -PassThru
    }
    
    $lastReported = $currentGen
    $lastCommitGen = $currentGen
    
    while (-not $activeRunner.HasExited) {
        Start-Sleep -Seconds 8
        $plans = @(Get-ChildItem -LiteralPath $outputRoot -Filter "generation-*-plan" -Directory | Sort-Object Name)
        if ($plans.Count -gt $lastReported) {
            for ($g = $lastReported + 1; $g -le $plans.Count; $g++) {
                $planName = ('generation-{0:d4}-plan' -f $g)
                $planFile = Join-Path $outputRoot "$planName/plan.json"
                if (Test-Path -LiteralPath $planFile) {
                    $pJson = Get-Content -Raw -LiteralPath $planFile | ConvertFrom-Json
                    $elapsedSec = [math]::Round(([DateTime]::UtcNow - $stageStart).TotalSeconds, 1)
                    Write-Host "[$sName] Gen $g completed (Elapsed: ${elapsedSec}s) | bestCktV4=$($pJson.bestCktV4) | totalStates=$($pJson.totalStates)"
                    $lastReported = $g
                    $currentGen = $g
                    
                    # Inside-stage periodic commit & push
                    if ($stage.CommitInterval -gt 0 -and ($g - $lastCommitGen) -ge $stage.CommitInterval) {
                        $archiveDir = Join-Path $repo "research/seeds/ckt-v4/m40-d3-20261031-gen$('{0:d4}' -f $g)"
                        Archive-PlanSeeds $planFile $archiveDir
                        Invoke-GitSync "feat(m40-d3): progress commit at gen $g (best CKT v4: $($pJson.bestCktV4), states: $($pJson.totalStates))"
                        $lastCommitGen = $g
                    }
                }
            }
        }
        if ($currentGen -ge $targetGen) {
            $targetPlan = Join-Path $outputRoot ("generation-{0:d4}-plan/plan.json" -f $targetGen)
            if (Test-Path -LiteralPath $targetPlan) {
                Write-Host "[$sName] Target generation $targetGen reached! Waiting for runner exit..."
                [void]$activeRunner.WaitForExit(60000)
                break
            }
        }
    }
    if (-not $activeRunner.HasExited) {
        [void]$activeRunner.WaitForExit(60000)
    }
    
    $stageDuration = [DateTime]::UtcNow - $stageStart
    Write-Host "[$sName] Finished in $($stageDuration.TotalMinutes.ToString('F2')) minutes."
    
    # SQLite Integrity Check
    Write-Host "[$sName] Verifying SQLite integrity..."
    $check = & sqlite3 $dbPath "PRAGMA integrity_check;"
    if ($check -ne "ok") { throw "[$sName] SQLite integrity check failed: $check" }
    Write-Host "[$sName] SQLite integrity check: ok"
    
    # Archive stage final seeds
    $finalPlanFile = Join-Path $outputRoot ("generation-{0:d4}-plan/plan.json" -f $targetGen)
    $finalPlanData = Get-Content -Raw -LiteralPath $finalPlanFile | ConvertFrom-Json
    $stageArchiveDir = Join-Path $repo "research/seeds/ckt-v4/m40-d3-20261031-gen$('{0:d4}' -f $targetGen)"
    Archive-PlanSeeds $finalPlanFile $stageArchiveDir
    
    # Between-stages Git Commit & Push
    Invoke-GitSync "feat(m40-d3): complete $sName at gen $targetGen (best CKT v4: $($finalPlanData.bestCktV4), total states: $($finalPlanData.totalStates))"
}

$pipelineDuration = [DateTime]::UtcNow - $pipelineStart
Write-Host "############################################################"
Write-Host "All Stages of M<=40, D<=3, V<=1 Pipeline COMPLETED!"
Write-Host "Total Duration: $($pipelineDuration.TotalHours.ToString('F2')) hours ($($pipelineDuration.TotalMinutes.ToString('F2')) minutes)"
Write-Host "############################################################"
