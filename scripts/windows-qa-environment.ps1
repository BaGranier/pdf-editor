param([string]$Output = 'data/output/windows-qa-002/environment/environment.json')
$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$destination = [IO.Path]::GetFullPath((Join-Path $repository $Output))
if (!$destination.StartsWith($repository + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Output must be inside the repository.' }
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class PdfQaDisplays {
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int left, top, right, bottom; }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct Info {
        public int size; public Rect monitor, work; public uint flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string device;
    }
    public delegate bool Callback(IntPtr monitor, IntPtr dc, IntPtr rect, IntPtr data);
    [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, Callback callback, IntPtr data);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr monitor, ref Info info);
    [DllImport("shcore.dll")] static extern int GetDpiForMonitor(IntPtr monitor, int type, out uint x, out uint y);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [StructLayout(LayoutKind.Explicit, Size=220)] public struct Mode {
        [FieldOffset(68)] public ushort size;
        [FieldOffset(84)] public uint orientation;
    }
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern bool EnumDisplaySettings(string device, int mode, ref Mode settings);
    public static object[] Read() {
        var results = new List<object>();
        var previous = SetThreadDpiAwarenessContext(new IntPtr(-4));
        try {
            EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (monitor, dc, rect, data) => {
                var info = new Info { size = Marshal.SizeOf(typeof(Info)) };
                if (!GetMonitorInfo(monitor, ref info)) throw new Exception("GetMonitorInfo failed");
                uint x, y; int result = GetDpiForMonitor(monitor, 0, out x, out y);
                var mode = new Mode { size = 220 };
                bool orientationRead = EnumDisplaySettings(info.device, -1, ref mode);
                results.Add(new { name = info.device, bounds = info.monitor, workArea = info.work,
                    primary = (info.flags & 1) != 0, dpiX = result == 0 ? (uint?)x : null,
                    dpiY = result == 0 ? (uint?)y : null, dpiResult = result,
                    displayOrientation = orientationRead ? (uint?)mode.orientation : null,
                    orientationSource = "EnumDisplaySettings dmDisplayOrientation (0 default, 1 rotate90, 2 rotate180, 3 rotate270); not inferred from resolution" });
                return true;
            }, IntPtr.Zero);
        } finally { SetThreadDpiAwarenessContext(previous); }
        return results.ToArray();
    }
}
'@
function Read-Version([string]$Command, [string[]]$Arguments) {
    $resolved = Get-Command $Command -ErrorAction SilentlyContinue | Select-Object -First 1
    if (!$resolved) { return @{ status = 'ENV'; reason = 'not found' } }
    $savedPreference = $ErrorActionPreference
    try {
        # Compiler version banners are written to stderr; they are evidence,
        # not PowerShell terminating errors.
        $ErrorActionPreference = 'Continue'
        $lines = & $resolved.Source @Arguments 2>&1 | ForEach-Object { $_.ToString() }
        $safePath = $resolved.Source.Replace($repository, '<repository>').Replace($env:USERPROFILE, '<profile>')
        return @{ status = $(if ($LASTEXITCODE -eq 0) { 'OK' } else { 'PARTIAL' }); exitCode = $LASTEXITCODE; executable = $safePath; output = @($lines | Select-Object -First 50) }
    } catch { return @{ status = 'ENV'; reason = 'version command failed' } }
    finally { $ErrorActionPreference = $savedPreference }
}
$os = Get-CimInstance Win32_OperatingSystem
$gpu = Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,VideoModeDescription
$runtime = @()
foreach ($key in @('HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\*', 'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\*', 'HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\*')) {
    $runtime += @(Get-ItemProperty $key -ErrorAction SilentlyContinue | Where-Object { $_.name -like '*WebView2*' } | Select-Object name,pv)
}
$tools = [ordered]@{}
foreach ($spec in @(
    @('node','--version'), @('npm.cmd','--version'), @('py','-3.11','--version'), @('uv','--version'),
    @('rustc','-vV'), @('cargo','--version'), @('rustup','toolchain','list'), @('cl','/?'), @('link','/?'),
    @('tesseract','--version'), @('tesseract','--list-langs'), @('ocrmypdf','--version'),
    @('gswin64c','--version'), @('qpdf','--version'), @('soffice','--version'))) {
    $tools[($spec -join ' ')] = Read-Version $spec[0] $spec[1..($spec.Length-1)]
}
$sdk = @(Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\Include' -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
$msvc = @(Get-ChildItem 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC' -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
foreach ($version in $msvc) {
    $bin = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\$version\bin\Hostx64\x64"
    foreach ($name in @('cl', 'link')) { $tools["MSVC $name $version"] = Read-Version (Join-Path $bin ($name + '.exe')) @('/?') }
}
$tools['uv locked Python'] = Read-Version 'uv' @('run', '--locked', '--project', (Join-Path $repository 'services/pdf-engine'), 'python', '--version')
$result = [ordered]@{
    timestamp = [DateTime]::UtcNow.ToString('o'); commit = (& git -C $repository rev-parse HEAD)
    os = @{ caption = $os.Caption; version = $os.Version; build = $os.BuildNumber; architecture = $os.OSArchitecture }
    ram = @{ totalKiB = $os.TotalVisibleMemorySize; availableKiB = $os.FreePhysicalMemory }
    virtualization = @(Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model,HypervisorPresent,NumberOfLogicalProcessors)
    cpu = @(Get-CimInstance Win32_Processor | Select-Object Name,Architecture,NumberOfLogicalProcessors)
    monitors = @([PdfQaDisplays]::Read()); gpu = @($gpu); webview2 = $runtime
    tools = $tools; msvcDirectories = $msvc; windowsSdkDirectories = $sdk
    runtimeMetrics = 'Tauri scale factor, WebView DPR and window dimensions are captured by windows-qa-cdp.cjs, not inferred here.'
}
New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($destination)) | Out-Null
$result | ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 -LiteralPath $destination
Write-Output $destination
