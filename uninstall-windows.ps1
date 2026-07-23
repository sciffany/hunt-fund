# Remove the sleep_tracker scheduled task and its VBS wrapper.
#
# Usage: powershell -ExecutionPolicy Bypass -File .\uninstall-windows.ps1

#Requires -Version 5.1
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TaskName  = "SleepTracker"
$VbsPath   = Join-Path $ScriptDir "run-sleep-tracker.vbs"

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch {}
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "removed scheduled task $TaskName"
} else {
    Write-Host "no scheduled task named $TaskName (nothing to remove)"
}

# Best-effort: kill any leftover pythonw.exe running our script (the scheduled
# task's Stop only stops the wscript wrapper; the detached pythonw child
# lives on).
Get-CimInstance Win32_Process -Filter "Name = 'pythonw.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -match [regex]::Escape("sleep_tracker.py") } |
    ForEach-Object {
        try {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
            Write-Host "killed pythonw.exe pid=$($_.ProcessId)"
        } catch {
            Write-Host "could not stop pythonw.exe pid=$($_.ProcessId): $_"
        }
    }

if (Test-Path $VbsPath) {
    Remove-Item -LiteralPath $VbsPath -Force
    Write-Host "removed $VbsPath"
}
