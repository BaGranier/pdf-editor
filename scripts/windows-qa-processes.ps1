param([ValidateSet('Snapshot','KillWorker','KillSidecar','CrashShell')][string]$Action = 'Snapshot')
$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$applications = @(Get-Process pdf-studio-local -ErrorAction SilentlyContinue)
if ($applications.Count -ne 1) { throw 'Exactly one QA application required.' }
$application = $applications[0]
if (!$application.Path.StartsWith($repository + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Application must be a repository QA installation.' }
$all = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -eq $application.Id -or $_.CreationDate.ToUniversalTime() -ge $application.StartTime.ToUniversalTime() })
$ids = @($application.Id)
do {
    $newIds = @($all | Where-Object { $_.ParentProcessId -in $ids -and $_.ProcessId -notin $ids } | Select-Object -ExpandProperty ProcessId)
    $ids += $newIds
} while ($newIds.Count)
$processes = @($all | Where-Object { $_.ProcessId -in $ids } | Select-Object ProcessId,ParentProcessId,Name)
$ports = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -in $ids -and $_.LocalAddress -eq '127.0.0.1' } | Select-Object -ExpandProperty LocalPort)
$target = $null
if ($Action -eq 'KillSidecar') { $target = $processes | Where-Object { $_.Name -eq 'pdf-engine.exe' -and $_.ParentProcessId -eq $application.Id } }
if ($Action -eq 'KillWorker') { $target = $processes | Where-Object { $_.Name -eq 'pdf-engine.exe' -and $_.ParentProcessId -ne $application.Id } }
if ($Action -eq 'CrashShell') { $target = $processes | Where-Object { $_.ProcessId -eq $application.Id } }
if ($Action -ne 'Snapshot') {
    if (@($target).Count -ne 1) { throw 'Exactly one target process required.' }
    & taskkill.exe /F /PID $target.ProcessId | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'taskkill failed.' }
    Start-Sleep -Seconds 2
}
$snapshot = @($ids | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue } | ForEach-Object {
    [pscustomobject]@{ pid = $_.Id; name = $_.ProcessName; workingSetBytes = $_.WorkingSet64; privateBytes = $_.PrivateMemorySize64; cpuSeconds = $_.CPU; handles = $_.HandleCount }
})
$output = Join-Path $repository 'data/output/windows-qa-002/performance'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$remainingPorts = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in $ports -and $_.LocalAddress -eq '127.0.0.1' } | Select-Object -ExpandProperty LocalPort)
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('com.local.pdfstudio/backend-' + $application.Id)
[ordered]@{ timestamp = [DateTime]::UtcNow.ToString('o'); action = $Action; before = $processes; after = $snapshot; beforeListenPorts = $ports; remainingListenPorts = $remainingPorts; temporaryDirectoryRemains = (Test-Path -LiteralPath $temporary) } | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $output ($Action + '.json'))
$snapshot | Select-Object pid,name,workingSetBytes
