param(
    [Parameter(Mandatory = $true)]
    [string]$Config
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$configPath = (Resolve-Path -LiteralPath $Config).Path
$settings = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json

if ($settings.version -ne 'ckt-v4-explorer-config-1') {
    throw "unsupported explorer config version: $($settings.version)"
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

function Add-Optional([Collections.Generic.List[string]]$Arguments, [string]$Flag, $Value) {
    if ($null -ne $Value) {
        $Arguments.Add($Flag)
        $Arguments.Add([string]$Value)
    }
}

$manifest = Resolve-RepoPath 'research/ckt-v4-core/Cargo.toml'
& cargo build --release --manifest-path $manifest --bin anneal-native --bin plan-exploration
if ($LASTEXITCODE -ne 0) { throw 'release build failed' }

$binDir = Resolve-RepoPath 'research/ckt-v4-core/target/release'
$annealer = Join-Path $binDir 'anneal-native.exe'
$planner = Join-Path $binDir 'plan-exploration.exe'
$corpus = Resolve-RepoPath $settings.corpus
$schemes = Resolve-RepoPath $settings.schemes
$snapshot = Resolve-RepoPath $settings.snapshot
$ergonomics = Resolve-RepoPath $settings.ergonomicFixture
$root = Resolve-RepoPath $settings.outputRoot
$archive = Join-Path $root 'exploration-archive.json'
$null = New-Item -ItemType Directory -Force -Path $root

$generation = 1
while ($settings.generations -eq 0 -or $generation -le $settings.generations) {
    $generationName = 'generation-{0:d4}' -f $generation
    $generationDir = Join-Path $root $generationName
    $planDir = Join-Path $root "$generationName-plan"
    $null = New-Item -ItemType Directory -Force -Path $generationDir
    $archiveInput = Join-Path $generationDir 'archive-input.json'
    if ((Test-Path -LiteralPath $archive) -and -not (Test-Path -LiteralPath $archiveInput)) {
        Copy-Item -LiteralPath $archive -Destination $archiveInput
    }

    if ($generation -eq 1) {
        $schemeSeeds = @($settings.initialSchemes | ForEach-Object {
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
        if (Test-Path -LiteralPath $archiveInput) { Add-Optional $arguments '--avoid-archive' $archiveInput }
        Add-Optional $arguments '--max-memory' $settings.guards.maxMemory
        Add-Optional $arguments '--max-d' $settings.guards.maxD
        Add-Optional $arguments '--max-v' $settings.guards.maxV
        Add-Optional $arguments '--max-rp-s2' $settings.guards.maxRpS2
        Add-Optional $arguments '--max-rp' $settings.guards.maxRp
        Add-Optional $arguments '--max-w' $settings.guards.maxW
        Add-Optional $arguments '--max-y' $settings.guards.maxY
        Add-Optional $arguments '--min-home-floor' $settings.guards.minHomeFloor
        Add-Optional $arguments '--min-mx-score' $settings.guards.minMxScore
        if ($resume) { $arguments.Add('--resume') }
        Invoke-LowPriority $annealer $arguments.ToArray() $stdout $stderr
    }

    if (-not (Test-Path -LiteralPath $planDir)) {
        $arguments = [Collections.Generic.List[string]]::new()
        foreach ($value in @(
            '--archive', $archive,
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
    }

    $plannedArchive = Join-Path $planDir 'archive-after.json'
    if (-not (Test-Path -LiteralPath $plannedArchive)) {
        throw "generation archive snapshot is missing: $plannedArchive"
    }
    Copy-Item -LiteralPath $plannedArchive -Destination $archive -Force

    $reviewPath = Join-Path $planDir 'review-queue.json'
    $reviews = @(Get-Content -Raw -LiteralPath $reviewPath | ConvertFrom-Json)
    if ($reviews.Count -gt 0) {
        Write-Warning "generation $generation queued $($reviews.Count) possible basin reviews at $reviewPath"
        if ($settings.pauseOnReview) { break }
    }
    $generation++
}
