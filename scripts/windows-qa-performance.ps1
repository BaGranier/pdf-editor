param(
    [string]$Executable = 'data/output/windows-qa-002/installers/NSIS/pdf-studio-local.exe',
    [int]$Repetitions = 5
)
$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$binary = [IO.Path]::GetFullPath((Join-Path $repository $Executable))
if (!$binary.StartsWith($repository + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'QA executable must be inside the repository.' }
if (@(Get-Process pdf-studio-local -ErrorAction SilentlyContinue).Count) { throw 'Close existing application before performance QA.' }
$output = Join-Path $repository 'data/output/windows-qa-002/performance'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'
$env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $output 'webview-profile'
$fixture = Join-Path $repository 'apps/web/e2e/fixtures/conversion-simple-text.pdf'
$runs = @()
for ($iteration = 0; $iteration -lt $Repetitions; $iteration++) {
    $started = [DateTime]::UtcNow
    $application = Start-Process -FilePath $binary -ArgumentList ('"' + $fixture + '"') -PassThru -WindowStyle Hidden
    $knownIds = @($application.Id)
    try {
        do {
            Start-Sleep -Milliseconds 25
            $application.Refresh()
            if ($application.HasExited) { throw 'Application exited before window.' }
            if (([DateTime]::UtcNow - $started).TotalSeconds -gt 30) { throw 'Window timeout.' }
        } while (!$application.MainWindowHandle)
        $windowObserved = [DateTime]::UtcNow
        & node (Join-Path $PSScriptRoot 'windows-qa-cdp.cjs') startup
        if ($LASTEXITCODE -ne 0) { throw 'CDP startup failed.' }
        $cdp = Get-Content -Raw -LiteralPath (Join-Path $repository 'data/output/windows-qa-002/reports/startup.json') | ConvertFrom-Json
        Start-Sleep -Seconds 2
        # Parent PIDs can be reused by Windows. Exclude processes older than
        # this launch before walking the tree (e.g. an unrelated OneDrive child).
        $all = @(Get-CimInstance Win32_Process | Where-Object { $_.CreationDate.ToUniversalTime() -ge $application.StartTime.ToUniversalTime() })
        do {
            $newIds = @($all | Where-Object { $_.ParentProcessId -in $knownIds -and $_.ProcessId -notin $knownIds } | Select-Object -ExpandProperty ProcessId)
            $knownIds += $newIds
        } while ($newIds.Count)
        $snapshot = @($knownIds | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue } | ForEach-Object {
            [pscustomobject]@{ pid = $_.Id; name = $_.ProcessName; workingSetBytes = $_.WorkingSet64; privateBytes = $_.PrivateMemorySize64; cpuSeconds = $_.CPU; handles = $_.HandleCount }
        })
        $runs += @{
            iteration = $iteration + 1; status = 'OK'; kind = 'warm/uncontrolled cache'; started = $started.ToString('o')
            windowObservedMs = ($windowObserved - $started).TotalMilliseconds
            backendReadyObservedMs = ([DateTime]::Parse($cdp.backendReadyObservedAt).ToUniversalTime() - $started).TotalMilliseconds
            pdfCanvasObservedMs = ([DateTime]::Parse($cdp.pdfCanvasObservedAt).ToUniversalTime() - $started).TotalMilliseconds
            processes = $snapshot; processCount = $snapshot.Count
            workingSetBytes = ($snapshot | Measure-Object -Property workingSetBytes -Sum).Sum
            note = 'Window handle poll 25ms; backend/CDP observer includes Node connection overhead; canvas presence is a proxy, not a complete interactivity benchmark. Working sets include shared pages.'
        }
    } finally {
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'windows-native-qa.ps1') -Action Close
        Start-Sleep -Seconds 2
        $remaining = @(Get-Process -Id $knownIds -ErrorAction SilentlyContinue)
        if ($runs.Count) { $runs[-1].remainingAfterClose = $remaining.Count }
        $runs | ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $output 'startup.json')
        if ($remaining.Count) { throw 'Application descendants remain after normal close.' }
    }
}
Write-Output (Join-Path $output 'startup.json')
