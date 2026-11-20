param([switch]$SkipEnumeration)
$ErrorActionPreference = 'Stop'
$um40Root = Split-Path -Parent $PSScriptRoot
$um40Cache = Join-Path $um40Root 'research/.cache/um40-policy-resource-guard'
[IO.Directory]::CreateDirectory($um40Cache) | Out-Null
$um40Audit = @()

function Invoke-Um40Guarded {
    param([string]$Label, [string]$Executable, [string[]]$Arguments, [double]$MaximumRssGB)
    $um40Os = Get-CimInstance Win32_OperatingSystem
    if ($um40Os.FreePhysicalMemory -lt 6*1MB) { throw 'Need at least 6 GB of available RAM before starting' }
    $um40Out = Join-Path $um40Cache "$Label.stdout.log"
    $um40Err = Join-Path $um40Cache "$Label.stderr.log"
    $um40Child = Start-Process -FilePath $Executable -ArgumentList $Arguments -WorkingDirectory $um40Root -PassThru -WindowStyle Hidden -RedirectStandardOutput $um40Out -RedirectStandardError $um40Err
    $um40Peak = 0.0; $um40MinFree = [double]::PositiveInfinity; $um40LastReport = [datetime]::MinValue
    while (-not $um40Child.HasExited) {
        $um40Child.Refresh()
        if ($um40Child.HasExited) { break }
        $um40Rss = $um40Child.WorkingSet64 / 1GB
        $um40Free = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB
        $um40Peak = [math]::Max($um40Peak,$um40Rss); $um40MinFree = [math]::Min($um40MinFree,$um40Free)
        if ($um40Rss -gt $MaximumRssGB -or $um40Free -lt 6) {
            $um40Child.Kill()
            throw "$Label stopped by RAM guard: RSS=$um40Rss GB, available=$um40Free GB; completed checkpoints retained"
        }
        if (([datetime]::Now-$um40LastReport).TotalSeconds -ge 20) {
            @{stage=$Label;rssGB=[math]::Round($um40Rss,2);availableGB=[math]::Round($um40Free,2)} | ConvertTo-Json -Compress
            $um40LastReport = [datetime]::Now
        }
        Start-Sleep -Seconds 2
    }
    $um40Child.WaitForExit()
    if ($um40Child.ExitCode -ne 0) { throw "$Label failed (exit $($um40Child.ExitCode)); see $um40Err" }
    [IO.File]::ReadAllText($um40Out)
    $script:um40Audit += @{stage=$Label;peakRssGB=$um40Peak;minimumAvailableGB=$um40MinFree;exitCode=$um40Child.ExitCode}
    $script:um40Audit | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $um40Cache 'memory-audit.json') -Encoding utf8
}

$um40Node = (Get-Command node).Source
$um40Python = (Get-Command python).Source
if (-not $SkipEnumeration) {
    $um40Existing = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*enumerate_um40_v52_policies*' })
    if ($um40Existing.Count) { throw 'An UM40 enumeration worker is already running; refusing parallel launch' }
    Invoke-Um40Guarded 'compact-input' $um40Node @('--max-old-space-size=1024',('"'+(Join-Path $PSScriptRoot 'prepare_um40_policy_compact.js')+'"')) 1.5
    Invoke-Um40Guarded 'enumeration' $um40Node @('--expose-gc','--max-old-space-size=3072',('"'+(Join-Path $PSScriptRoot 'enumerate_um40_v52_policies_compact.js')+'"')) 3.5
}
$env:OPENBLAS_NUM_THREADS='1'; $env:OMP_NUM_THREADS='1'
Invoke-Um40Guarded 'wide-grids' $um40Python @('-X','utf8',('"'+(Join-Path $PSScriptRoot 'audit_um40_v52_policies.py')+'"')) 2
