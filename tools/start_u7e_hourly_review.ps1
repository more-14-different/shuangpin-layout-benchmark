param([string]$ThreadId=$env:CODEX_THREAD_ID,[string]$Work='')
$ErrorActionPreference='Stop'
if (-not $ThreadId) { throw 'Specify the existing Codex thread ID.' }
$taskRoot=Split-Path -Parent $PSScriptRoot
if (-not $Work) { $Work=Join-Path $taskRoot 'research/.cache/u7e-grouped-cpu-20261121' }
$taskWork=[IO.Path]::GetFullPath($Work)
$taskFolder=Join-Path $taskWork 'ai-reviews'
New-Item -ItemType Directory -Path $taskFolder -Force | Out-Null
if (Test-Path -LiteralPath (Join-Path $taskFolder 'STOP')) { throw 'AI review timer STOP marker is present.' }
$taskStatus=Join-Path $taskFolder 'timer-status.json'
if (Test-Path -LiteralPath $taskStatus) {
    $taskOld=Get-Content -LiteralPath $taskStatus -Raw | ConvertFrom-Json
    $taskExisting=Get-CimInstance Win32_Process -Filter "ProcessId = $($taskOld.pid)" -ErrorAction SilentlyContinue
    if ($taskExisting -and $taskExisting.CommandLine -like '*schedule_u7e_hourly_review.py*') { throw "Timer already running as PID $($taskOld.pid)" }
}
$taskPython=(Get-Command python.exe).Source
$taskScript=Join-Path $PSScriptRoot 'schedule_u7e_hourly_review.py'
$taskArgs='-X utf8 "{0}" --work "{1}" --thread "{2}" --interval 3600' -f $taskScript,$taskWork,$ThreadId
$taskProcess=Start-Process -FilePath $taskPython -ArgumentList $taskArgs -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskFolder 'timer-stdout.log') -RedirectStandardError (Join-Path $taskFolder 'timer-stderr.log') -PassThru
$taskProcess.PriorityClass='BelowNormal'
[pscustomobject]@{pid=$taskProcess.Id;threadId=$ThreadId;work=$taskWork;intervalSeconds=3600} | ConvertTo-Json -Compress
