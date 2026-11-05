param([ValidateSet('Inspect','100','125')][string]$Scale = 'Inspect')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ReleaseScale {
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
    [DllImport("user32.dll")] public static extern IntPtr MonitorFromPoint(Point point, uint flags);
    [DllImport("shcore.dll")] public static extern int GetScaleFactorForMonitor(IntPtr monitor, out int scale);
    public static int Current() { int scale; int hr = GetScaleFactorForMonitor(MonitorFromPoint(new Point(), 1), out scale); if (hr != 0) throw new Exception("GetScaleFactorForMonitor failed: " + hr); return scale; }
}
'@
Start-Process 'ms-settings:display' -WindowStyle Hidden
$combo = $null
for ($attempt = 0; !$combo -and $attempt -lt 40; $attempt++) {
    $window = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition) | Where-Object { $_.Current.Name -match '^Param|^Settings$' } | Select-Object -First 1
    if ($window) {
        $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, 'SystemSettings_Display_Scaling_ItemSizeOverride_ComboBox')
        $combo = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
    }
    if (!$combo) { Start-Sleep -Milliseconds 250 }
}
if (!$combo -or !$combo.Current.IsEnabled) { throw 'Windows display scaling control is unavailable.' }
$selection = $combo.GetCurrentPattern([System.Windows.Automation.SelectionPattern]::Pattern)
$before = @($selection.Current.GetSelection())[0].Current.Name
if ($Scale -ne 'Inspect' -and $before -notmatch ('^' + $Scale + '\s*%')) {
    $combo.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern).Expand()
    Start-Sleep -Milliseconds 300
    $item = $combo.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition) | Where-Object { $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::ListItem -and $_.Current.Name -match ('^' + $Scale + '\s*%') } | Select-Object -First 1
    if (!$item) { throw 'Requested physical Windows scale is not offered.' }
    $item.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()
    Start-Sleep -Seconds 2
}
$after = @($selection.Current.GetSelection())[0].Current.Name
$physical = [ReleaseScale]::Current()
if ($Scale -ne 'Inspect' -and ($after -notmatch ('^' + $Scale + '\s*%') -or $physical -ne [int]$Scale)) { throw 'Windows scale change was not confirmed by Settings and monitor API.' }
[pscustomobject]@{ before=$before; after=$after; physicalScale=$physical; mechanism='Windows Settings UI Automation + GetScaleFactorForMonitor'; simulated=$false } | ConvertTo-Json -Compress

