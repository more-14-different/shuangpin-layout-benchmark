param([double]$Hours = 6)
$ErrorActionPreference = 'Stop'
$alrRoot = Split-Path -Parent $PSScriptRoot
$alrWork = Join-Path $alrRoot 'research/.cache/a-locked-rhymes-v52-6h-20261121'
[IO.Directory]::CreateDirectory($alrWork) | Out-Null
$alrNode = (Get-Command node).Source
$alrScript = Join-Path $PSScriptRoot 'search_a_locked_rhymes_v52.js'
$alrResourceLog = Join-Path $alrWork 'resource-monitor.jsonl'
$alrDeadline = [datetime]::UtcNow.AddHours($Hours)
$alrCheckpoint = Join-Path $alrWork 'checkpoint.json'
if (Test-Path -LiteralPath $alrCheckpoint) {
    $alrSaved = [IO.File]::ReadAllText($alrCheckpoint) | ConvertFrom-Json -DateKind String
    $alrDeadline = [datetimeoffset]::Parse($alrSaved.deadline).UtcDateTime
}
$alrOther = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*search_a_locked_rhymes_v52.js*' })
if ($alrOther.Count) { throw 'A locked-rhyme search is already running' }
$alrAttempts=0
while ([datetime]::UtcNow -lt $alrDeadline) {
    if (Test-Path -LiteralPath (Join-Path $alrWork 'STOP')) { break }
    $alrFree=(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB
    if ($alrFree -lt 6) { Start-Sleep -Seconds 10; continue }
    $alrArgs=@('--expose-gc','--max-old-space-size=1536',('"'+$alrScript+'"'),('--hours='+$Hours))
    $alrChild=Start-Process -FilePath $alrNode -ArgumentList $alrArgs -WorkingDirectory $alrRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $alrWork 'search.stdout.log') -RedirectStandardError (Join-Path $alrWork 'search.stderr.log')
    $alrRestart=$false; $alrLast=[datetime]::MinValue
    while (-not $alrChild.HasExited) {
        $alrChild.Refresh(); if ($alrChild.HasExited) { break }
        $alrDesc=@(Get-CimInstance Win32_Process -Filter "Name='score-untoned-v52-2126-stream.exe'" | Where-Object { $_.ParentProcessId -eq $alrChild.Id })
        $alrRss=$alrChild.WorkingSet64/1GB
        foreach($alrWorker in $alrDesc){$alrP=Get-Process -Id $alrWorker.ProcessId -ErrorAction SilentlyContinue; if($alrP){$alrRss+=$alrP.WorkingSet64/1GB}}
        $alrFree=(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB
        if (([datetime]::UtcNow-$alrLast).TotalSeconds -ge 20) {
            @{time=[datetime]::UtcNow.ToString('o');nodePid=$alrChild.Id;workerPids=@($alrDesc.ProcessId);combinedRssGB=$alrRss;availableGB=$alrFree} | ConvertTo-Json -Compress | Add-Content -LiteralPath $alrResourceLog -Encoding utf8
            $alrLast=[datetime]::UtcNow
        }
        if ($alrRss -gt 2.5 -or $alrFree -lt 4) {
            $alrChild.Kill()
            foreach($alrWorker in $alrDesc){Stop-Process -Id $alrWorker.ProcessId -ErrorAction SilentlyContinue}
            $alrRestart=$true; break
        }
        if ([datetime]::UtcNow -gt $alrDeadline.AddSeconds(30)) {
            $alrChild.Kill(); foreach($alrWorker in $alrDesc){Stop-Process -Id $alrWorker.ProcessId -ErrorAction SilentlyContinue}; break
        }
        Start-Sleep -Seconds 2
    }
    $alrChild.WaitForExit()
    if ($alrChild.ExitCode -eq 0 -and -not $alrRestart) { break }
    $alrAttempts++
    if ($alrAttempts -ge 3 -and -not $alrRestart) { throw 'Search failed three times; inspect search.stderr.log. Checkpoints retained.' }
    Start-Sleep -Seconds 10
}
