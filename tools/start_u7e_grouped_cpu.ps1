param(
    [double]$Hours = 24,
    [double]$Duty = 0.65,
    [string]$Work = '',
    [switch]$PinkyCap
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
if (-not $Work) { $Work = Join-Path $taskRoot 'research/.cache/u7e-grouped-cpu-20261121' }
$taskWork = [IO.Path]::GetFullPath($Work)
if ($Hours -le 0 -or $Duty -le 0 -or $Duty -gt 1) { throw 'Invalid hours/duty' }
New-Item -ItemType Directory -Path $taskWork -Force | Out-Null
if (Test-Path -LiteralPath (Join-Path $taskWork 'STOP')) { throw 'STOP marker is present; preserve it until an explicit resume.' }
$statusPath = Join-Path $taskWork 'status.json'
if (Test-Path -LiteralPath $statusPath) {
    $oldStatus = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
    $oldProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($oldStatus.pid)" -ErrorAction SilentlyContinue
    if ($oldProcess -and $oldProcess.CommandLine -like '*run_u7e_grouped_cpu.py*') { throw "Campaign already running as PID $($oldStatus.pid)" }
}
$taskPython = (Get-Command python.exe).Source
$taskScript = Join-Path $PSScriptRoot 'run_u7e_grouped_cpu.py'
$taskArguments = '-X utf8 "{0}" --work "{1}" --hours {2} --duty {3}' -f $taskScript,$taskWork,$Hours.ToString([Globalization.CultureInfo]::InvariantCulture),$Duty.ToString([Globalization.CultureInfo]::InvariantCulture)
if ($PinkyCap) { $taskArguments += ' --pinky-cap' }
$taskProcess = Start-Process -FilePath $taskPython -ArgumentList $taskArguments -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskWork 'stdout.log') -RedirectStandardError (Join-Path $taskWork 'stderr.log') -PassThru
$taskProcess.PriorityClass = 'BelowNormal'
[pscustomobject]@{pid=$taskProcess.Id;work=$taskWork;hours=$Hours;duty=$Duty;cpuOnly=$true;hardPinkyCap=[bool]$PinkyCap} | ConvertTo-Json -Compress
