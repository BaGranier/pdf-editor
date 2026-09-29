# Native QA helper for a single PDF Studio Local instance on French Windows.
# Document paths are restricted to the repository; no desktop-wide input is sent.
param(
    [ValidateSet('Inspect', 'Open', 'Save', 'Cancel', 'Overwrite', 'Close', 'Maximize', 'Restore', 'Resize')]
    [string]$Action = 'Inspect',
    [string]$Path
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class PdfStudioNativeQa {
    public delegate bool Callback(IntPtr handle, IntPtr param);
    [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, Callback callback, IntPtr param);
    [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback, IntPtr param);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint pid);
    public static IntPtr WindowForAction(int applicationPid, string action) {
        IntPtr result = IntPtr.Zero;
        EnumWindows((handle, param) => {
            uint pid; GetWindowThreadProcessId(handle, out pid);
            if (pid == applicationPid) {
                var name = new System.Text.StringBuilder(256); GetWindowText(handle, name, 256);
                string title = name.ToString();
                bool match = action == "Open" ? title == "Ouvrir un PDF"
                    : action == "Save" ? title == "Enregistrer le PDF sous"
                    : action == "Overwrite" ? title.StartsWith("Confirmer")
                    : action == "Cancel" ? title.StartsWith("Confirmer") || title == "Enregistrer le PDF sous" || title == "Ouvrir un PDF"
                    : action == "Inspect" ? title == "Ouvrir un PDF" || title == "Enregistrer le PDF sous" || title == "PDF Studio Local"
                    : title == "PDF Studio Local";
                if (match) { result = handle; return false; }
            }
            return true;
        }, IntPtr.Zero);
        return result;
    }
    [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr handle);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr handle, System.Text.StringBuilder text, int count);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr handle, System.Text.StringBuilder text, int count);
    public static IntPtr FilenameControl(IntPtr parent, bool inspect) {
        IntPtr result = IntPtr.Zero;
        EnumChildWindows(parent, (handle, param) => {
            var cls = new System.Text.StringBuilder(256);
            var name = new System.Text.StringBuilder(256);
            GetClassName(handle, cls, 256); GetWindowText(handle, name, 256);
            int id = GetDlgCtrlID(handle);
            if (inspect) Console.WriteLine(id + " " + cls + " " + name);
            if (cls.ToString() == "Edit" && (id == 1148 || id == 1001 || id == 1152)) result = handle;
            return true;
        }, IntPtr.Zero);
        return result;
    }
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr SendMessage(IntPtr handle, uint message, IntPtr wparam, string text);
    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr handle, uint message, IntPtr wparam, IntPtr lparam);
    [DllImport("user32.dll", EntryPoint="SendMessageW")]
    public static extern IntPtr SendValue(IntPtr handle, uint message, IntPtr wparam, IntPtr lparam);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
    public static IntPtr NamedButton(IntPtr parent, string buttonName) {
        IntPtr result = IntPtr.Zero;
        EnumChildWindows(parent, (handle, param) => {
            var cls = new System.Text.StringBuilder(256);
            var text = new System.Text.StringBuilder(256);
            GetClassName(handle, cls, 256); GetWindowText(handle, text, 256);
            if (cls.ToString() == "Button" && text.ToString().Replace("&", "") == buttonName) result = handle;
            return true;
        }, IntPtr.Zero);
        return result;
    }
    public static void TypeFilename(IntPtr handle, string path) {
        SendValue(handle, 0x00B1, IntPtr.Zero, new IntPtr(-1)); // EM_SETSEL
        foreach (char character in path) SendValue(handle, 0x0102, new IntPtr(character), IntPtr.Zero);
    }
}
'@
$applications = @(Get-Process pdf-studio-local -ErrorAction SilentlyContinue)
if ($applications.Count -ne 1) { throw 'Exactly one PDF Studio Local QA instance is required.' }
$application = $applications[0]
$nativeWindow = [PdfStudioNativeQa]::WindowForAction($application.Id, $Action)
for ($attempt = 0; $nativeWindow -eq [IntPtr]::Zero -and $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 250
    $nativeWindow = [PdfStudioNativeQa]::WindowForAction($application.Id, $Action)
}
if ($nativeWindow -eq [IntPtr]::Zero) { throw "No application window for $Action." }
$root = [System.Windows.Automation.AutomationElement]::FromHandle($nativeWindow)
if ($Action -eq 'Overwrite') {
    $popup = $nativeWindow
    $confirm = [PdfStudioNativeQa]::NamedButton($popup, 'Oui')
    if ($confirm -eq [IntPtr]::Zero) {
        $dialogs = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
        foreach ($dialog in $dialogs) {
            if ($dialog.Current.Name -like 'Confirmer*' -and $dialog.Current.NativeWindowHandle) {
                $confirm = [PdfStudioNativeQa]::NamedButton([IntPtr]$dialog.Current.NativeWindowHandle, 'Oui')
                if ($confirm -ne [IntPtr]::Zero) { break }
            }
        }
    }
    if ($confirm -eq [IntPtr]::Zero) { throw 'Native overwrite confirmation not found.' }
    [PdfStudioNativeQa]::SetForegroundWindow($popup) | Out-Null
    $confirmElement = [System.Windows.Automation.AutomationElement]::FromHandle($confirm)
    $confirmInvoke = $null
    if ($confirmElement.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$confirmInvoke)) {
        $confirmInvoke.Invoke()
        exit
    }
    [PdfStudioNativeQa]::PostMessage($confirm, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    exit
}
if ($Action -eq 'Close') { [PdfStudioNativeQa]::PostMessage($nativeWindow, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null; exit }
$windowPattern = $null
if ($root.TryGetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern, [ref]$windowPattern)) {
    if ($Action -eq 'Maximize') { $windowPattern.SetWindowVisualState([System.Windows.Automation.WindowVisualState]::Maximized); exit }
    if ($Action -eq 'Restore') { $windowPattern.SetWindowVisualState([System.Windows.Automation.WindowVisualState]::Normal); exit }
}
if ($Action -eq 'Resize') {
    $transform = $root.GetCurrentPattern([System.Windows.Automation.TransformPattern]::Pattern)
    $transform.Resize(1100, 740)
    exit
}
$elements = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
if ($Action -eq 'Inspect') {
    [PdfStudioNativeQa]::FilenameControl($nativeWindow, $true) | Out-Null
    $root.Current | Format-List Name,BoundingRectangle
    foreach ($element in $elements) {
        $current = $element.Current
        if ($current.ControlType -in @([System.Windows.Automation.ControlType]::Edit,[System.Windows.Automation.ControlType]::Button,[System.Windows.Automation.ControlType]::Window)) {
            $current | Format-List Name,AutomationId,ClassName,ControlType
        }
    }
    exit
}
if ($Action -in @('Open','Save')) {
    if (!$Path) { throw 'A repository QA path is required.' }
    $repository = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')) + '\'
    $destination = [System.IO.Path]::GetFullPath($Path)
    if (!$destination.StartsWith($repository, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'QA documents must remain inside the repository.'
    }
    $nativeEdit = [PdfStudioNativeQa]::FilenameControl($nativeWindow, $false)
    if ($nativeEdit -ne [IntPtr]::Zero) {
        [PdfStudioNativeQa]::SetForegroundWindow($nativeWindow) | Out-Null
        if ($Action -eq 'Open') {
            [PdfStudioNativeQa]::SendMessage($nativeEdit, 0x000C, [IntPtr]::Zero, $destination) | Out-Null
        } else {
            [PdfStudioNativeQa]::TypeFilename($nativeEdit, $destination)
        }
        $nativeButton = [PdfStudioNativeQa]::NamedButton($nativeWindow, $(if ($Action -eq 'Open') { 'Ouvrir' } else { 'Enregistrer' }))
        if ($nativeButton -eq [IntPtr]::Zero) { throw 'Native action button not found.' }
        [PdfStudioNativeQa]::PostMessage($nativeButton, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
        exit
    }
    throw 'Native filename control not found.'
}
$buttonName = 'Annuler'
$button = $elements | Where-Object { $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and ($_.Current.Name -replace '&','') -eq $buttonName } | Select-Object -First 1
if (!$button) {
    if ($Action -ne 'Cancel') { throw "Unsupported native action $Action." }
    $commandId = 2
    [PdfStudioNativeQa]::PostMessage($nativeWindow, 0x0111, [IntPtr]$commandId, [IntPtr]::Zero) | Out-Null
    exit
}
$button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
