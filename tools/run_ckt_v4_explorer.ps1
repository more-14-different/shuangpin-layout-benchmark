param(
    [Parameter(Mandatory = $true)]
    [string]$Config,
    [Parameter(Mandatory = $false)]
    [int64]$StopAtGeneration = 0
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$configPath = (Resolve-Path -LiteralPath $Config).Path
$settings = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json

if ($settings.version -ne 'ckt-v4-explorer-config-1') {
    throw "unsupported explorer config version: $($settings.version)"
}
$requiredSettings = @(
    'schemeTemplate', 'reference', 'corpus', 'schemes', 'snapshot', 'ergonomicFixture',
    'outputRoot', 'generations', 'stepsPerChain', 'nextSeedCount', 'baseSeed', 'temperature',
    'checkpointEvery', 'verifyEvery', 'dutyMs', 'mxCorpus', 'mxVariant', 'maxCktDelta',
    'noveltyDistance', 'basinRadius', 'basinSupport', 'guards'
)
foreach ($name in $requiredSettings) {
    if ($name -notin $settings.PSObject.Properties.Name -or $null -eq $settings.$name) {
        throw "explorer config is missing required setting: $name"
    }
}
if ([int64]$settings.generations -lt 0 -or
    [int64]$settings.stepsPerChain -lt 1 -or
    [int64]$settings.nextSeedCount -lt 1 -or
    [int64]$settings.checkpointEvery -lt 0 -or
    [int64]$settings.verifyEvery -lt 0 -or
    [int64]$settings.dutyMs -lt 0 -or
    -not [double]::IsFinite([double]$settings.temperature) -or
    [double]$settings.temperature -le 0 -or
    -not [double]::IsFinite([double]$settings.maxCktDelta) -or
    [double]$settings.maxCktDelta -lt 0 -or
    [int64]$settings.noveltyDistance -lt 0 -or
    [int64]$settings.basinRadius -lt 0 -or
    [int64]$settings.basinSupport -lt 1) {
    throw 'invalid explorer numeric configuration'
}

function Resolve-RepoPath([string]$Path) {
    if ([IO.Path]::IsPathRooted($Path)) { return [IO.Path]::GetFullPath($Path) }
    return [IO.Path]::GetFullPath((Join-Path $repo $Path))
}

function Invoke-LowPriority([string]$File, [string[]]$Arguments, [string]$Stdout, [string]$Stderr) {
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $File
    $info.WorkingDirectory = $repo
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    foreach ($argument in $Arguments) { $null = $info.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $info
    if (-not $process.Start()) { throw "failed to start $File" }
    try { $process.PriorityClass = [Diagnostics.ProcessPriorityClass]::BelowNormal } catch {}
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    [IO.File]::WriteAllText($Stdout, $stdoutTask.Result)
    [IO.File]::WriteAllText($Stderr, $stderrTask.Result)
    if ($process.ExitCode -ne 0) {
        throw "$File failed with exit code $($process.ExitCode); see $Stderr"
    }
}

function Start-CudaBatchSession([string]$File) {
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $File
    $info.WorkingDirectory = $repo
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $null = $info.ArgumentList.Add('--batch-session')
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $info
    if (-not $process.Start()) { throw "failed to start CUDA batch session: $File" }
    try { $process.PriorityClass = [Diagnostics.ProcessPriorityClass]::BelowNormal } catch {}
    [pscustomobject]@{
        Process = $process
        StderrTask = $process.StandardError.ReadToEndAsync()
    }
}

function Invoke-CudaBatchSession(
    [pscustomobject]$Session,
    [string]$Manifest,
    [string]$RequestId,
    [string]$Stdout,
    [string]$Stderr
) {
    $request = [ordered]@{
        version = 'ckt-v4-anneal-session-request-1'
        requestId = $RequestId
        manifest = $Manifest
    } | ConvertTo-Json -Compress
    $Session.Process.StandardInput.WriteLine($request)
    $Session.Process.StandardInput.Flush()

    $responsePrefix = '@ckt-v4-batch-session@'
    $output = [Text.StringBuilder]::new()
    $response = $null
    while ($null -eq $response) {
        $line = $Session.Process.StandardOutput.ReadLine()
        if ($null -eq $line) {
            throw "CUDA batch session exited before completing request ${RequestId}"
        }
        if ($line.StartsWith($responsePrefix, [StringComparison]::Ordinal)) {
            $response = $line.Substring($responsePrefix.Length) | ConvertFrom-Json
            if ($response.version -ne 'ckt-v4-anneal-session-response-1' -or
                $response.requestId -cne $RequestId) {
                throw "CUDA batch session returned an unexpected response for request ${RequestId}"
            }
        } else {
            $null = $output.AppendLine($line)
        }
    }
    [IO.File]::WriteAllText($Stdout, $output.ToString(), [Text.UTF8Encoding]::new($false))
    if (-not $response.ok) {
        [IO.File]::WriteAllText($Stderr, "$($response.error)`n", [Text.UTF8Encoding]::new($false))
        throw "CUDA batch session request $RequestId failed; see $Stderr"
    }
    [IO.File]::WriteAllText($Stderr, '', [Text.UTF8Encoding]::new($false))
}

function Stop-CudaBatchSession([pscustomobject]$Session, [string]$Stderr) {
    if (-not $Session.Process.HasExited) {
        try { $Session.Process.StandardInput.Close() } catch {}
    }
    $Session.Process.WaitForExit()
    [IO.File]::WriteAllText($Stderr, $Session.StderrTask.Result, [Text.UTF8Encoding]::new($false))
    $exitCode = $Session.Process.ExitCode
    $Session.Process.Dispose()
    if ($exitCode -ne 0) {
        throw "CUDA batch session failed with exit code $exitCode; see $Stderr"
    }
}

function Add-Optional([Collections.Generic.List[string]]$Arguments, [string]$Flag, $Value) {
    if ($null -ne $Value) {
        $Arguments.Add($Flag)
        $Arguments.Add([string]$Value)
    }
}

$initialSchemeIds = @($settings.initialSchemes | ForEach-Object { [string]$_ })
if ('cudaFull' -in $settings.PSObject.Properties.Name -and $settings.cudaFull -isnot [bool]) {
    throw 'explorer cudaFull setting must be a JSON boolean'
}
$cudaFull = 'cudaFull' -in $settings.PSObject.Properties.Name -and $settings.cudaFull
if ('cudaBatch' -in $settings.PSObject.Properties.Name -and $settings.cudaBatch -isnot [bool]) {
    throw 'explorer cudaBatch setting must be a JSON boolean'
}
$cudaBatch = 'cudaBatch' -in $settings.PSObject.Properties.Name -and $settings.cudaBatch
if ($cudaBatch -and -not $cudaFull) {
    throw 'explorer cudaBatch requires cudaFull'
}
$cudaBatchWindowMs = if ('cudaBatchWindowMs' -in $settings.PSObject.Properties.Name) {
    [uint64]$settings.cudaBatchWindowMs
} else {
    [uint64]100
}
if ($cudaBatchWindowMs -lt 1 -or $cudaBatchWindowMs -gt 60000) {
    throw 'explorer cudaBatchWindowMs must be between 1 and 60000'
}
$initialRankingPath = $null
if ('initialRanking' -in $settings.PSObject.Properties.Name -and $null -ne $settings.initialRanking) {
    $initialRankingPath = Resolve-RepoPath ([string]$settings.initialRanking)
    $ranking = Get-Content -Raw -LiteralPath $initialRankingPath | ConvertFrom-Json
    if ($ranking.version -ne 'ckt-v4-ranked-explorer-seeds-1') {
        throw "unsupported initial ranking version: $($ranking.version)"
    }
    $rankedIds = @($ranking.selected | Sort-Object rank | ForEach-Object { [string]$_.id })
    if ($rankedIds.Count -eq 0) { throw "initial ranking contains no selected schemes: $initialRankingPath" }
    $initialSchemeIds = @($initialSchemeIds + $rankedIds | Select-Object -Unique)
}

$manifest = Resolve-RepoPath 'research/ckt-v4-core/Cargo.toml'
$buildArguments = @('build', '--quiet', '--release', '--manifest-path', $manifest, '--bin', 'anneal-native', '--bin', 'plan-exploration')
if ($cudaFull) { $buildArguments += @('--features', 'cuda') }
& cargo @buildArguments
if ($LASTEXITCODE -ne 0) { throw 'release build failed' }

$binDir = Resolve-RepoPath 'research/ckt-v4-core/target/release'
$annealer = Join-Path $binDir 'anneal-native.exe'
$planner = Join-Path $binDir 'plan-exploration.exe'
$corpus = Resolve-RepoPath $settings.corpus
$schemes = Resolve-RepoPath $settings.schemes
$snapshot = Resolve-RepoPath $settings.snapshot
$ergonomics = Resolve-RepoPath $settings.ergonomicFixture
$schemeFixture = Get-Content -Raw -LiteralPath $schemes | ConvertFrom-Json
$availableSchemeIds = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
foreach ($scheme in $schemeFixture.schemes) { $null = $availableSchemeIds.Add([string]$scheme.id) }
foreach ($requiredSchemeId in @([string]$settings.schemeTemplate, [string]$settings.reference) + $initialSchemeIds) {
    if (-not $availableSchemeIds.Contains($requiredSchemeId)) {
        throw "explorer scheme $requiredSchemeId is absent from fixture: $schemes"
    }
}
Remove-Variable -Name schemeFixture, availableSchemeIds
$root = Resolve-RepoPath $settings.outputRoot
$database = Join-Path $root 'exploration.sqlite3'
$null = New-Item -ItemType Directory -Force -Path $root

$lockPath = Join-Path $root 'run.lock'
try {
    $runLock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
} catch {
    throw "another explorer process is using output root: $root"
}

$telemetryFile = Join-Path $root 'telemetry.csv'
$monitorScript = Join-Path $repo 'tools/monitor_production.ps1'
if (Test-Path -LiteralPath $monitorScript) {
    $null = Start-Process -FilePath "pwsh" -ArgumentList "-NoLogo", "-NoProfile", "-File", "`"$monitorScript`"", "-TargetPid", "$PID", "-OutputFile", "`"$telemetryFile`"", "-IntervalSec", "15" -WindowStyle Hidden
}

$contract = [ordered]@{
    version = 'ckt-v4-explorer-contract-1'
    initialSchemes = $initialSchemeIds
    initialRanking = if ($null -eq $initialRankingPath) { $null } else { [string]$settings.initialRanking }
    initialLayouts = @($settings.initialLayouts | ForEach-Object { [string]$_ })
    schemeTemplate = [string]$settings.schemeTemplate
    reference = [string]$settings.reference
    corpus = [string]$settings.corpus
    schemes = [string]$settings.schemes
    snapshot = [string]$settings.snapshot
    ergonomicFixture = [string]$settings.ergonomicFixture
    stepsPerChain = [uint64]$settings.stepsPerChain
    nextSeedCount = [uint64]$settings.nextSeedCount
    baseSeed = [uint64]$settings.baseSeed
    temperature = [double]$settings.temperature
    mxCorpus = [string]$settings.mxCorpus
    mxVariant = [string]$settings.mxVariant
    maxCktDelta = [double]$settings.maxCktDelta
    noveltyDistance = [uint64]$settings.noveltyDistance
    basinRadius = [uint64]$settings.basinRadius
    basinSupport = [uint64]$settings.basinSupport
    guards = [ordered]@{
        maxMemory = $settings.guards.maxMemory
        maxD = $settings.guards.maxD
        maxV = $settings.guards.maxV
        maxRpS2 = $settings.guards.maxRpS2
        maxRp = $settings.guards.maxRp
        maxW = $settings.guards.maxW
        maxY = $settings.guards.maxY
        minHomeFloor = $settings.guards.minHomeFloor
        minMxScore = $settings.guards.minMxScore
    }
}
$contractPath = Join-Path $root 'run-contract.json'
$contractJson = $contract | ConvertTo-Json -Depth 10 -Compress
if (Test-Path -LiteralPath $contractPath) {
    $savedContractJson = Get-Content -Raw -LiteralPath $contractPath | ConvertFrom-Json | ConvertTo-Json -Depth 10 -Compress
    if ($savedContractJson -cne $contractJson) {
        $runLock.Dispose()
        throw "explorer scientific contract differs from existing output root: $contractPath"
    }
} else {
    $contractTemporary = "$contractPath.tmp"
    [IO.File]::WriteAllText($contractTemporary, "$contractJson`n", [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $contractTemporary -Destination $contractPath
}

$batchSession = $null
try {
  if ($cudaBatch) {
    $batchSession = Start-CudaBatchSession $annealer
  }
  $generation = 1
  while (($settings.generations -eq 0 -or $generation -le $settings.generations) -and ($StopAtGeneration -eq 0 -or $generation -le $StopAtGeneration)) {
    $generationName = 'generation-{0:d4}' -f $generation
    $generationDir = Join-Path $root $generationName
    $planDir = Join-Path $root "$generationName-plan"
    $null = New-Item -ItemType Directory -Force -Path $generationDir
    if ($generation -eq 1) {
        $schemeSeeds = @($initialSchemeIds | ForEach-Object {
            [pscustomobject]@{ Kind = 'scheme'; Value = [string]$_; Label = [string]$_ }
        })
        $layoutSeeds = @($settings.initialLayouts | ForEach-Object {
            $layoutPath = Resolve-RepoPath ([string]$_)
            [pscustomobject]@{ Kind = 'layout'; Value = $layoutPath; Label = [IO.Path]::GetFileNameWithoutExtension($layoutPath) }
        })
        $seedItems = @($schemeSeeds) + @($layoutSeeds)
    } else {
        $priorPlan = Join-Path $root (('generation-{0:d4}-plan' -f ($generation - 1)))
        if (-not (Test-Path -LiteralPath $priorPlan)) {
            throw "prior generation plan is missing: $priorPlan"
        }
        $seedItems = @(Get-ChildItem -LiteralPath $priorPlan -Filter 'seed-*.json' -File |
            Sort-Object Name |
            ForEach-Object {
                [pscustomobject]@{ Kind = 'layout'; Value = $_.FullName; Label = $_.BaseName }
            })
    }
    if ($seedItems.Count -eq 0) { throw "generation $generation has no seeds" }

    $logs = [Collections.Generic.List[string]]::new()
    $batchChains = [Collections.Generic.List[object]]::new()
    for ($index = 0; $index -lt $seedItems.Count; $index++) {
        $item = $seedItems[$index]
        $jobName = 'chain-{0:d2}-{1}' -f ($index + 1), ($item.Label -replace '[^A-Za-z0-9_.-]', '_')
        $checkpoint = Join-Path $generationDir "$jobName.checkpoint.json"
        $frontierLog = Join-Path $generationDir "$jobName.evaluated.jsonl"
        $stdout = Join-Path $generationDir "$jobName.stdout.log"
        $stderr = Join-Path $generationDir "$jobName.stderr.log"
        $logs.Add($frontierLog)

        $resume = $false
        if (Test-Path -LiteralPath $checkpoint) {
            $saved = Get-Content -Raw -LiteralPath $checkpoint | ConvertFrom-Json
            if ($saved.targetSteps -ne $settings.stepsPerChain) {
                throw "checkpoint step contract differs: $checkpoint"
            }
            if ($saved.iteration -eq $saved.targetSteps) { continue }
            $resume = $true
        }

        $template = if ($item.Kind -eq 'scheme') { $item.Value } else { [string]$settings.schemeTemplate }
        $arguments = [Collections.Generic.List[string]]::new()
        foreach ($value in @($corpus, $schemes, $snapshot, $template)) { $arguments.Add($value) }
        foreach ($value in @(
            '--reference', [string]$settings.reference,
            '--steps', [string]$settings.stepsPerChain,
            '--seed', [string]([uint64]$settings.baseSeed + [uint64]$generation * 100000 + [uint64]$index),
            '--temperature', [string]$settings.temperature,
            '--checkpoint', $checkpoint,
            '--checkpoint-every', [string]$settings.checkpointEvery,
            '--verify-every', [string]$settings.verifyEvery,
            '--duty-ms', [string]$settings.dutyMs,
            '--frontier-log', $frontierLog,
            '--record', 'evaluated',
            '--ergonomic-fixture', $ergonomics,
            '--mx-corpus', [string]$settings.mxCorpus,
            '--mx-variant', [string]$settings.mxVariant
        )) { $arguments.Add($value) }
        if ($item.Kind -eq 'layout' -and -not $resume) { Add-Optional $arguments '--initial-layout' $item.Value }
        if ($generation -gt 1) {
            if (-not (Test-Path -LiteralPath $database)) {
                throw "exploration database is missing before generation ${generation}: $database"
            }
            Add-Optional $arguments '--exploration-database' $database
            Add-Optional $arguments '--avoid-generation' ($generation - 1)
        }
        Add-Optional $arguments '--max-memory' $settings.guards.maxMemory
        Add-Optional $arguments '--max-d' $settings.guards.maxD
        Add-Optional $arguments '--max-v' $settings.guards.maxV
        Add-Optional $arguments '--max-rp-s2' $settings.guards.maxRpS2
        Add-Optional $arguments '--max-rp' $settings.guards.maxRp
        Add-Optional $arguments '--max-w' $settings.guards.maxW
        Add-Optional $arguments '--max-y' $settings.guards.maxY
        Add-Optional $arguments '--min-home-floor' $settings.guards.minHomeFloor
        Add-Optional $arguments '--min-mx-score' $settings.guards.minMxScore
        if ($cudaFull) { $arguments.Add('--cuda-full') }
        if ($resume) { $arguments.Add('--resume') }
        if ($cudaBatch) {
            $batchChains.Add([ordered]@{ arguments = @($arguments.ToArray()) })
        } else {
            Invoke-LowPriority $annealer $arguments.ToArray() $stdout $stderr
        }
    }
    if ($cudaBatch -and $batchChains.Count -gt 0) {
        $batchManifest = Join-Path $generationDir 'anneal-batch.json'
        $batchDocument = [ordered]@{
            version = 'ckt-v4-anneal-batch-1'
            batchWindowMs = $cudaBatchWindowMs
            chains = @($batchChains)
        }
        $batchJson = $batchDocument | ConvertTo-Json -Depth 10
        [IO.File]::WriteAllText($batchManifest, "$batchJson`n", [Text.UTF8Encoding]::new($false))
        $batchStdout = Join-Path $generationDir 'anneal-batch.stdout.log'
        $batchStderr = Join-Path $generationDir 'anneal-batch.stderr.log'
        Invoke-CudaBatchSession $batchSession $batchManifest $generationName $batchStdout $batchStderr
    }

    if (-not (Test-Path -LiteralPath $planDir)) {
        $arguments = [Collections.Generic.List[string]]::new()
        foreach ($value in @(
            '--database', $database,
            '--output-dir', $planDir,
            '--generation', [string]$generation,
            '--seeds', [string]$settings.nextSeedCount,
            '--max-ckt-delta', [string]$settings.maxCktDelta,
            '--novelty-distance', [string]$settings.noveltyDistance,
            '--basin-radius', [string]$settings.basinRadius,
            '--basin-support', [string]$settings.basinSupport
        )) { $arguments.Add($value) }
        foreach ($log in $logs) {
            if (-not (Test-Path -LiteralPath $log)) { throw "frontier log is missing: $log" }
            $arguments.Add('--log')
            $arguments.Add($log)
        }
        $plannerArguments = $arguments.ToArray()
        & $planner @plannerArguments
        if ($LASTEXITCODE -ne 0) { throw "generation $generation planning failed" }

        $enhanceScript = Join-Path $repo 'tools/enhance_exploration_seeds.py'
        if (Test-Path -LiteralPath $enhanceScript) {
            & python $enhanceScript $planDir
            if ($LASTEXITCODE -ne 0) { throw "generation $generation seed enhancement failed" }
        }
    }

    $databaseState = Join-Path $planDir 'database-state.json'
    if (-not (Test-Path -LiteralPath $databaseState) -or -not (Test-Path -LiteralPath $database)) {
        throw "generation database state is missing: $databaseState / $database"
    }

    $reviewPath = Join-Path $planDir 'review-queue.json'
    $reviews = @(Get-Content -Raw -LiteralPath $reviewPath | ConvertFrom-Json)
    if ($reviews.Count -gt 0) {
        Write-Warning "generation $generation queued $($reviews.Count) possible basin reviews at $reviewPath"
        if ($settings.pauseOnReview) { break }
    }
      $generation++
  }
} finally {
    try {
        if ($null -ne $batchSession) {
            Stop-CudaBatchSession $batchSession (Join-Path $root 'anneal-batch-session.stderr.log')
        }
    } finally {
        $runLock.Dispose()
    }
}
