param(
    [Parameter(Mandatory = $true)]
    [int]$TargetPid,
    [Parameter(Mandatory = $true)]
    [string]$OutputFile,
    [int]$IntervalSec = 5
)

$header = "Timestamp,TargetPid,WorkingSetMB,PrivateBytesMB,GpuUtilPercent,VramUsedMB,VramTotalMB,GpuTempC,GpuPowerW"
if (-not (Test-Path -LiteralPath $OutputFile)) {
    [IO.File]::WriteAllText($OutputFile, "$header`r`n", [Text.UTF8Encoding]::new($false))
}

while ($true) {
    $proc = Get-Process -Id $TargetPid -ErrorAction SilentlyContinue
    if ($null -eq $proc -or $proc.HasExited) {
        break
    }

    $wsMb = [math]::Round($proc.WorkingSet64 / 1MB, 2)
    $pmMb = [math]::Round($proc.PrivateMemorySize64 / 1MB, 2)

    $gpuLine = & nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw --format=csv,noheader,nounits 2>$null
    $gpuParts = if ($LASTEXITCODE -eq 0 -and $gpuLine) { $gpuLine.Split(',').ForEach({ $_.Trim() }) } else { @('N/A','N/A','N/A','N/A','N/A') }

    $now = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $csvRow = "$now,$TargetPid,$wsMb,$pmMb,$($gpuParts[0]),$($gpuParts[1]),$($gpuParts[2]),$($gpuParts[3]),$($gpuParts[4])"
    [IO.File]::AppendAllText($OutputFile, "$csvRow`r`n", [Text.UTF8Encoding]::new($false))

    Start-Sleep -Seconds $IntervalSec
}
