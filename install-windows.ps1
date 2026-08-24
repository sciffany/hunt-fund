# Install sleep_tracker as a per-user scheduled task on Windows.
# Idempotent: rerun it after editing .env or the script.
#
# Usage (from an ordinary, non-admin PowerShell in the repo root):
#   powershell -ExecutionPolicy Bypass -File .\install-windows.ps1

#Requires -Version 5.1
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TaskName  = "SleepTracker"
$LogDir    = Join-Path $env:LOCALAPPDATA "SleepTracker"
$LogFile   = Join-Path $LogDir "sleep_tracker.log"

Set-Location $ScriptDir

if (-not (Test-Path (Join-Path $ScriptDir ".env"))) {
    Write-Host "no .env file found in $ScriptDir" -ForegroundColor Red
    Write-Host "copy .env.example to .env and fill it in first:" -ForegroundColor Red
    Write-Host "    Copy-Item .env.example .env" -ForegroundColor Red
    exit 1
}

# Pick a Python launcher. Prefer the py launcher (bundled with python.org
# installers); fall back to whatever `python` is on PATH.
$launcher = $null
$launcherArgs = @()
if (Get-Command py -ErrorAction SilentlyContinue) {
    $launcher = "py"
    $launcherArgs = @("-3")
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $launcher = "python"
} else {
    Write-Host "no Python found on PATH. Install Python 3.10+ from https://python.org and re-run." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path (Join-Path $ScriptDir ".venv"))) {
    Write-Host "creating virtualenv at .venv..."
    & $launcher @launcherArgs -m venv .venv
}

$venvPython  = Join-Path $ScriptDir ".venv\Scripts\python.exe"
$venvPythonw = Join-Path $ScriptDir ".venv\Scripts\pythonw.exe"
$pyvenvCfg   = Join-Path $ScriptDir ".venv\pyvenv.cfg"

if (-not (Test-Path $venvPython)) {
    Write-Host "venv is missing python.exe at $venvPython" -ForegroundColor Red
    exit 1
}

function Get-VenvHome {
    if (-not (Test-Path $pyvenvCfg)) { return $null }
    foreach ($line in Get-Content -LiteralPath $pyvenvCfg) {
        if ($line -match '^\s*home\s*=\s*(.+?)\s*$') {
            return $Matches[1].Trim().Trim('"')
        }
    }
    return $null
}

$venvHome = Get-VenvHome
if ($venvHome -match '\\WindowsApps\\') {
    Write-Host "this venv was created with Microsoft Store Python, which cannot load OpenSSL for HTTPS." -ForegroundColor Red
    Write-Host "install Python 3.10+ from https://python.org (check 'Add python.exe to PATH')," -ForegroundColor Red
    Write-Host "delete the .venv folder, and rerun this script." -ForegroundColor Red
    exit 1
}

# Stop a leftover tracker so DLL copy isn't blocked and we don't end up
# with two pythonw processes after re-registering the task.
Get-CimInstance Win32_Process -Filter "Name = 'pythonw.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match [regex]::Escape("sleep_tracker.py") } |
    ForEach-Object {
        try {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
            Write-Host "stopped previous tracker pid=$($_.ProcessId)"
        } catch {
            Write-Host "could not stop pid=$($_.ProcessId): $_"
        }
    }

# Windows always searches the directory containing pythonw.exe for DLLs.
# python.org puts libssl/libcrypto next to the *base* interpreter, so a venv
# launched by Task Scheduler (no PATH) cannot import _ssl unless we copy them.
if ($venvHome) {
    $searchDirs = @(
        $venvHome
        (Join-Path $venvHome "DLLs")
        (Join-Path $venvHome "Library\bin")
    )
    $destDir = Join-Path $ScriptDir ".venv\Scripts"
    $copied = $false
    foreach ($dir in $searchDirs) {
        if (-not (Test-Path $dir)) { continue }
        foreach ($pattern in @("libssl*.dll", "libcrypto*.dll")) {
            Get-ChildItem -LiteralPath $dir -Filter $pattern -ErrorAction SilentlyContinue |
                ForEach-Object {
                    $dll = $_
                    try {
                        Copy-Item -LiteralPath $dll.FullName -Destination $destDir -Force
                        $copied = $true
                    } catch {
                        Write-Host "could not copy $($dll.Name): $_"
                    }
                }
        }
    }
    if ($copied) {
        Write-Host "copied OpenSSL DLLs into .venv\Scripts (needed for HTTPS under Task Scheduler)"
    }
}

Write-Host "checking venv HTTPS support..."
$oldPath = $env:PATH
try {
    # Task Scheduler PATH is essentially System32. If ssl imports in that
    # environment, the scheduled task will be able to POST over HTTPS.
    $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
    $sslProbe = & $venvPython -c "import ssl, urllib.request, http.client; assert hasattr(http.client, 'HTTPSConnection'); assert hasattr(urllib.request, 'HTTPSHandler'); print(ssl.OPENSSL_VERSION)"
    if ($LASTEXITCODE -ne 0) {
        throw "ssl probe exited $LASTEXITCODE"
    }
    Write-Host "  $sslProbe"
} catch {
    Write-Host "venv Python cannot open HTTPS (OpenSSL DLLs not loadable)." -ForegroundColor Red
    Write-Host "install Python from https://python.org, delete .venv, and rerun." -ForegroundColor Red
    exit 1
} finally {
    $env:PATH = $oldPath
}

Write-Host "installing requirements into .venv..."
& $venvPython -m pip install --quiet --upgrade pip
& $venvPython -m pip install --quiet -r (Join-Path $ScriptDir "requirements.txt")

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}

# Write a tiny VBS wrapper. We use wscript.exe + pythonw.exe so nothing flashes
# a console window at logon, and so we can inject SLEEP_TRACKER_LOG without
# polluting the user's permanent environment.
$vbsPath = Join-Path $ScriptDir "run-sleep-tracker.vbs"
$vbsBody = @'
' Auto-generated by install-windows.ps1 - do not edit by hand.
Option Explicit
Dim shell, fso, scriptDir, env, logDir
Set shell = CreateObject("WScript.Shell")
Set fso   = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = scriptDir
Set env = shell.Environment("PROCESS")
If env("SLEEP_TRACKER_LOG") = "" Then
    logDir = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%\SleepTracker")
    If Not fso.FolderExists(logDir) Then fso.CreateFolder(logDir)
    env("SLEEP_TRACKER_LOG") = logDir & "\sleep_tracker.log"
End If
' Task Scheduler PATH is just System32. OpenSSL DLLs live next to the base
' Python install (pyvenv.cfg home=) and in its DLLs folder. Prepend both.
Dim cfg, ts, line, home, dlls
cfg = scriptDir & "\.venv\pyvenv.cfg"
home = ""
If fso.FileExists(cfg) Then
    Set ts = fso.OpenTextFile(cfg, 1)
    Do Until ts.AtEndOfStream
        line = ts.ReadLine
        If LCase(Left(Trim(line), 4)) = "home" Then
            home = Trim(Mid(line, InStr(line, "=") + 1))
            If Left(home, 1) = """" Then home = Mid(home, 2, Len(home) - 2)
            Exit Do
        End If
    Loop
    ts.Close
End If
If home <> "" Then
    dlls = home & "\DLLs"
    env("PATH") = home & ";" & dlls & ";" & env("PATH")
End If
shell.Run """" & scriptDir & "\.venv\Scripts\pythonw.exe"" """ & scriptDir & "\sleep_tracker.py""", 0, False
'@
Set-Content -LiteralPath $vbsPath -Value $vbsBody -Encoding ASCII

# (Re)register the scheduled task under the current user.
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action    = New-ScheduledTaskAction -Execute "wscript.exe" -Argument ('"' + $vbsPath + '"')
$trigger   = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings  = New-ScheduledTaskSettingsSet `
                -AllowStartIfOnBatteries `
                -DontStopIfGoingOnBatteries `
                -StartWhenAvailable `
                -MultipleInstances IgnoreNew `
                -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal `
                -UserId $env:USERNAME `
                -LogonType Interactive `
                -RunLevel Limited

Register-ScheduledTask `
    -TaskName    $TaskName `
    -Action      $action `
    -Trigger     $trigger `
    -Settings    $settings `
    -Principal   $principal `
    -Description "Logs mouse/keyboard activity to hunt-fund (sleep_tracker)." | Out-Null

# Kick it off now so we don't wait until the next logon.
Start-ScheduledTask -TaskName $TaskName

Write-Host ""
Write-Host "sleep_tracker installed."
Write-Host "  task name: $TaskName"
Write-Host "  wrapper:   $vbsPath"
Write-Host "  log file:  $LogFile"
Write-Host ""
Write-Host "Useful commands:"
Write-Host "  stop:      Stop-ScheduledTask       -TaskName '$TaskName'"
Write-Host "  start:     Start-ScheduledTask      -TaskName '$TaskName'"
Write-Host "  restart:   Stop-ScheduledTask -TaskName '$TaskName'; Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "  status:    Get-ScheduledTask        -TaskName '$TaskName' | Get-ScheduledTaskInfo"
Write-Host "  tail log:  Get-Content -Wait '$LogFile'"
Write-Host "  uninstall: powershell -ExecutionPolicy Bypass -File .\uninstall-windows.ps1"
