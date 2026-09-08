@echo off
setlocal
cd /d "%~dp0"

where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo Node.js und npm wurden nicht gefunden. Bitte Node.js installieren.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo Abhaengigkeiten werden installiert...
    call npm.cmd ci
    if errorlevel 1 (
        echo Installation fehlgeschlagen.
        pause
        exit /b 1
    )
)

call npm.cmd run dev
set "devExitCode=%errorlevel%"
if not "%devExitCode%"=="0" (
    echo DEV konnte nicht erfolgreich ausgefuehrt werden.
    pause
)
exit /b %devExitCode%
