param(
    [string]$Output = 'research/.cache/u7e-fixed-gpu-20261120',
    [ValidateRange(0.01,168)][double]$Hours = 12,
    [ValidateRange(0.01,1)][double]$Duty = 0.25
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$outputPath = [IO.Path]::GetFullPath($Output, $repo)
$null = New-Item -ItemType Directory -Path $outputPath -Force
$pythonPath = (Get-Command python -ErrorAction Stop).Source
$invariant = [Globalization.CultureInfo]::InvariantCulture
$runnerPath = Join-Path $repo 'tools/run_u7e_gpu_anneal.py'
$arguments = @('-X', 'utf8', ('"' + $runnerPath + '"'),
    '--output', ('"' + $outputPath + '"'), '--hours', $Hours.ToString($invariant),
    '--duty', $Duty.ToString($invariant), '--batch', '2', '--backend', 'cuda')
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$process = Start-Process -FilePath $pythonPath -ArgumentList $arguments -WorkingDirectory $repo -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $outputPath "run-$stamp.stdout.log") `
    -RedirectStandardError (Join-Path $outputPath "run-$stamp.stderr.log") -PassThru
$launch = [ordered]@{
    pid = $process.Id
    launchedAt = (Get-Date).ToString('o')
    workingDirectory = $repo
    output = $outputPath
    hoursThisRun = $Hours
    duty = $Duty
    stdout = (Join-Path $outputPath "run-$stamp.stdout.log")
    stderr = (Join-Path $outputPath "run-$stamp.stderr.log")
}
$launch | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $outputPath "launch-$stamp.json") -Encoding utf8
$launch | ConvertTo-Json
