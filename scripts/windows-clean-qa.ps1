param(
    [ValidateSet('Install','Launch','Inspect','Close','Crash','Uninstall')][string]$Action = 'Inspect',
    [string]$Pdf = 'apps/web/e2e/fixtures/conversion-simple-text.pdf'
)
$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$output = Join-Path $repository 'data/output/windows-qa-004'
# Windows PowerShell 5 reads BOM-less scripts using the ANSI codepage.
# Construct accents explicitly so the actual installation path stays Unicode.
$installation = Join-Path $output ('installation ' + [char]0xE9 + 't' + [char]0xE9 + ' QA')
$executable = Join-Path $installation 'pdf-studio-local.exe'
New-Item -ItemType Directory -Force -Path $output | Out-Null
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class PdfCleanWindows {
    public delegate bool Callback(IntPtr window, IntPtr data);
    [DllImport("user32.dll")] static extern bool EnumWindows(Callback callback, IntPtr data);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr window, StringBuilder value, int size);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    public static object[] Consoles() {
        var values = new List<object>();
        EnumWindows((window, data) => {
            if (IsWindowVisible(window)) {
                var name = new StringBuilder(256); GetClassName(window, name, name.Capacity);
                if (name.ToString() == "ConsoleWindowClass" || name.ToString() == "CASCADIA_HOSTING_WINDOW_CLASS") {
                    uint pid; GetWindowThreadProcessId(window, out pid);
                    values.Add(new { handle = window.ToInt64(), pid, windowClass = name.ToString() });
                }
            }
            return true;
        }, IntPtr.Zero);
        return values.ToArray();
    }
}
'@
function App-Processes {
    $all = @(Get-CimInstance Win32_Process)
    $roots = @($all | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($installation + '\', [StringComparison]::OrdinalIgnoreCase) })
    $ids = @($roots | Select-Object -ExpandProperty ProcessId)
    if (!$ids.Count) { return @() }
    $earliest = ($roots | Sort-Object CreationDate | Select-Object -First 1).CreationDate
    do {
        $children = @($all | Where-Object { $_.ParentProcessId -in $ids -and $_.ProcessId -notin $ids -and $_.CreationDate -ge $earliest } | Select-Object -ExpandProperty ProcessId)
        $ids += $children
    } while ($children.Count)
    @($all | Where-Object { $_.ProcessId -in $ids })
}
if ($Action -eq 'Install') {
    if ((App-Processes).Count) { throw 'Close the QA installation first.' }
    $bundle = Join-Path $repository 'apps/desktop/src-tauri/target/release/bundle/nsis/PDF Studio Local_0.1.0_x64-setup.exe'
    # Silent installation on the development host; never label this clean-VM QA.
    $process = Start-Process -FilePath $bundle -ArgumentList @('/S', ('/D=' + $installation)) -PassThru -WindowStyle Hidden
    $process.WaitForExit()
    if ($process.ExitCode -ne 0 -or !(Test-Path -LiteralPath $executable)) { throw 'NSIS installation failed.' }
    [pscustomobject]@{ environment='development host'; scope='silent NSIS'; exitCode=$process.ExitCode; installerBytes=(Get-Item -LiteralPath $bundle).Length; installedBytes=(Get-ChildItem -LiteralPath $installation -Recurse -File | Measure-Object Length -Sum).Sum; files=@(Get-ChildItem -LiteralPath $installation -Recurse -File | ForEach-Object { $_.FullName.Substring($installation.Length + 1) }) } | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $output 'installation.json')
} elseif ($Action -eq 'Launch') {
    if ((App-Processes).Count) { throw 'QA installation already running.' }
    $arguments = @()
    if ($Pdf) {
        $fixture = [IO.Path]::GetFullPath((Join-Path $repository $Pdf))
        if (!$fixture.StartsWith($repository + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Synthetic fixture must be in repository.' }
        $arguments = @('"' + $fixture + '"')
    }
    $baseline = @([PdfCleanWindows]::Consoles())
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'
    $env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $output 'webview-profile'
    # Keep Windows itself in PATH; exclude developer and externally installed OCR tools.
    $previousPath = $env:Path
    $previousTemp = $env:TEMP
    $previousTmp = $env:TMP
    $env:Path = "$env:SystemRoot\System32;$env:SystemRoot"
    $temporary = Join-Path $output 'temp'
    New-Item -ItemType Directory -Force -Path $temporary | Out-Null
    $env:TEMP = $temporary
    $env:TMP = $temporary
    Remove-Item Env:TESSDATA_PREFIX -ErrorAction SilentlyContinue
    Remove-Item Env:PDF_ENGINE_OCR_RUNTIME -ErrorAction SilentlyContinue
    # Visible GUI launch is explicitly required by the console qualification.
    try {
        $options = @{ FilePath=$executable; PassThru=$true; WindowStyle='Normal' }
        if ($arguments.Count) { $options.ArgumentList = $arguments }
        $app = Start-Process @options
    }
    finally { $env:Path = $previousPath; $env:TEMP = $previousTemp; $env:TMP = $previousTmp }
    Start-Sleep -Seconds 2
    [pscustomobject]@{ pid=$app.Id; pathPolicy='Windows directories only; no external OCR'; consoleBaseline=$baseline; visibleConsoles=@([PdfCleanWindows]::Consoles()) } | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $output 'launch.json')
    Write-Output $app.Id
} elseif ($Action -eq 'Close' -or $Action -eq 'Crash') {
    $before = @(App-Processes)
    $ids = @($before | Select-Object -ExpandProperty ProcessId)
    $ports = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -in $ids -and $_.LocalAddress -eq '127.0.0.1' } | Select-Object -ExpandProperty LocalPort)
    $app = $before | Where-Object { $_.Name -eq 'pdf-studio-local.exe' } | Select-Object -First 1
    if ($app) {
        $process = Get-Process -Id $app.ProcessId
        if ($Action -eq 'Crash') { Stop-Process -Id $process.Id -Force }
        else { $null = $process.CloseMainWindow() }
    }
    Start-Sleep -Seconds 2
    $remaining = @(Get-CimInstance Win32_Process | Where-Object { $candidate = $_; @($before | Where-Object { $_.ProcessId -eq $candidate.ProcessId -and $_.CreationDate -eq $candidate.CreationDate }).Count -gt 0 } | Select-Object Name,ProcessId,ParentProcessId)
    $remainingPorts = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -eq '127.0.0.1' -and $_.LocalPort -in $ports } | Select-Object -ExpandProperty LocalPort)
    [pscustomobject]@{ action=$Action; remaining=$remaining; portsBefore=$ports; remainingPorts=$remainingPorts; timestamp=[DateTime]::UtcNow.ToString('o') } | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $output ($Action + '-' + [DateTime]::UtcNow.ToString('HHmmssfff') + '.json'))
    Write-Output ('Remaining application tree processes: ' + $remaining.Count)
} elseif ($Action -eq 'Uninstall') {
    if ((App-Processes).Count) { throw 'Close the QA installation first.' }
    $uninstaller = Join-Path $installation 'uninstall.exe'
    $process = Start-Process -FilePath $uninstaller -ArgumentList '/S' -PassThru -WindowStyle Hidden
    $process.WaitForExit()
    Start-Sleep -Seconds 2
    [pscustomobject]@{ exitCode=$process.ExitCode; executableRemaining=(Test-Path -LiteralPath $executable); environment='development host' } | ConvertTo-Json | Set-Content -Encoding utf8 -LiteralPath (Join-Path $output 'uninstallation.json')
} else {
    $processes = @(App-Processes | ForEach-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue } | ForEach-Object { [pscustomobject]@{ pid=$_.Id; name=$_.ProcessName; workingSetBytes=$_.WorkingSet64; privateBytes=$_.PrivateMemorySize64; handles=$_.HandleCount; cpuSeconds=$_.CPU } })
    [pscustomobject]@{ timestamp=[DateTime]::UtcNow.ToString('o'); processes=$processes; visibleConsoles=@([PdfCleanWindows]::Consoles()) } | ConvertTo-Json -Depth 5
}
