$ErrorActionPreference='Stop'
$arrRoot=Split-Path -Parent $PSScriptRoot
$arrReportPath=Join-Path $arrRoot 'research/.cache/a-locked-rhymes-v52-6h-20261121/live-report.json'
$arrSchedulePath=Join-Path $arrRoot 'research/.cache/a-locked-rhymes-v52-6h-20261121/reviews/schedule.json'
$arrReport=[IO.File]::ReadAllText($arrReportPath)|ConvertFrom-Json -DateKind String
$arrSchedule=[IO.File]::ReadAllText($arrSchedulePath)|ConvertFrom-Json -DateKind String
$arrStart=[datetimeoffset]::Parse($arrReport.startedAt).UtcDateTime
$arrEnd=[datetimeoffset]::Parse($arrReport.deadline).UtcDateTime
if([math]::Abs(($arrEnd-$arrStart).TotalHours-6) -gt .001){throw 'Search deadline changed'}
if($arrSchedule.slots.Count -ne 6){throw 'Expected six hourly checks'}
for($arrI=1;$arrI -le 6;$arrI++){
    $arrSlot=$arrSchedule.slots[$arrI-1]
    if($arrSlot.name -ne "hour-$arrI"){throw 'Slot identity mismatch'}
    $arrActual=[datetimeoffset]::Parse($arrSlot.at).UtcDateTime
    if([math]::Abs(($arrActual-$arrStart.AddHours($arrI)).TotalSeconds) -gt .001){throw 'Hourly schedule timezone conversion failed'}
}
$arrSynthetic='{"startedAt":"2026-11-20T21:30:36.997Z"}'|ConvertFrom-Json -DateKind String
if([datetimeoffset]::Parse($arrSynthetic.startedAt).UtcDateTime.ToString('yyyy-MM-dd HH:mm') -ne '2026-11-20 21:30'){throw 'UTC instant was shifted'}
@{checks=6;firstCheckLocal=([datetimeoffset]::Parse($arrSchedule.slots[0].at).LocalDateTime.ToString('o'));deadlineLocal=([datetimeoffset]::Parse($arrReport.deadline).LocalDateTime.ToString('o'));timezoneCheck='passed'}|ConvertTo-Json
