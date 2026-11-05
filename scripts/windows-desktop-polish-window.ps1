param([Parameter(Mandatory=$true)][int]$ApplicationPid, [ValidateSet('Inspect','Minimize','Resize','Close')][string]$Action = 'Inspect', [int]$Width = 1280, [int]$Height = 820)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DesktopPolishWindow {
    public delegate bool Callback(IntPtr window, IntPtr param);
    [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback, IntPtr param);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr window, System.Text.StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr window, int x, int y, int width, int height, bool repaint);
    public static void Resize(IntPtr window, int width, int height) {
        Rect outer, client; GetWindowRect(window, out outer); GetClientRect(window, out client);
        MoveWindow(window, outer.Left, outer.Top, width + outer.Right - outer.Left - client.Right, height + outer.Bottom - outer.Top - client.Bottom, true);
    }
    public static int Count(int applicationPid) {
        int count = 0;
        EnumWindows((window, param) => { uint pid; GetWindowThreadProcessId(window, out pid); var title = new System.Text.StringBuilder(256); GetWindowText(window, title, 256); if (pid == applicationPid && title.ToString() == "PDF Studio Local" && IsWindowVisible(window)) count++; return true; }, IntPtr.Zero);
        return count;
    }
    public static uint ForegroundPid() { uint pid; GetWindowThreadProcessId(GetForegroundWindow(), out pid); return pid; }
}
'@
$process = Get-Process -Id $ApplicationPid
$handle = $process.MainWindowHandle
if ($Action -eq 'Minimize') { [DesktopPolishWindow]::ShowWindow($handle, 6) | Out-Null }
if ($Action -eq 'Resize') { [DesktopPolishWindow]::Resize($handle, $Width, $Height) }
if ($Action -eq 'Close') { $process.CloseMainWindow() | Out-Null }
[pscustomobject]@{ windows=[DesktopPolishWindow]::Count($ApplicationPid); minimized=[DesktopPolishWindow]::IsIconic($handle); visible=[DesktopPolishWindow]::IsWindowVisible($handle); foregroundPid=[DesktopPolishWindow]::ForegroundPid() } | ConvertTo-Json -Compress
