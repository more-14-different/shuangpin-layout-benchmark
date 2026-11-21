param([Parameter(Mandatory=$true)][string]$ThreadId,[Parameter(Mandatory=$true)][string]$MessagePath)
$ErrorActionPreference='Stop'
$taskMessage=Get-Content -LiteralPath $MessagePath -Raw -Encoding utf8
& codex queue --thread $ThreadId --message $taskMessage --resume
exit $LASTEXITCODE
