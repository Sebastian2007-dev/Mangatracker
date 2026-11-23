@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
set "NO_PAUSE="
if /I "%~1"=="--no-pause" set "NO_PAUSE=1"

pushd "%ROOT%" >nul

rem Keep electron-builder's downloaded tools inside the project. This also
rem avoids permission errors when LOCALAPPDATA is read-only or restricted.
set "ELECTRON_BUILDER_CACHE=%ROOT%.cache\electron-builder"
if not exist "%ELECTRON_BUILDER_CACHE%" mkdir "%ELECTRON_BUILDER_CACHE%"
if errorlevel 1 (
  echo ERROR: Unable to create electron-builder cache:
  echo        %ELECTRON_BUILDER_CACHE%
  goto :error
)

echo [1/7] Preparing installer directory...
if not exist "installer" mkdir "installer"

rem Remove files in installer except .iss templates.
for %%F in ("installer\*") do (
  if /I not "%%~xF"==".iss" del /F /Q "%%~fF" >nul 2>&1
)

rem Remove all subdirectories under installer.
for /D %%D in ("installer\*") do (
  rd /S /Q "%%~fD" >nul 2>&1
)

echo [2/7] Ensuring dependencies are present...
rem npm install nur wenn node_modules fehlt ODER package-lock.json neuer ist als
rem der letzte Install (sonst baut man mit veralteten Dependencies).
set "NEED_INSTALL="
if not exist "node_modules\.package-lock.json" set "NEED_INSTALL=1"
if not defined NEED_INSTALL (
  for /f "usebackq delims=" %%R in (`powershell -NoProfile -Command "if ((Get-Item 'package-lock.json').LastWriteTimeUtc -gt (Get-Item 'node_modules\.package-lock.json').LastWriteTimeUtc) { 'stale' }"`) do set "NEED_INSTALL=1"
)
if defined NEED_INSTALL (
  call npm install --legacy-peer-deps
  if errorlevel 1 goto :error
)

echo       Running typecheck gate...
call npm run typecheck
if errorlevel 1 goto :error

rem electron-builder 24.x ships macOS symlinks in its Windows helper archive.
rem Extract only the Windows-relevant files so the build works without admin
rem rights or Windows Developer Mode.
call :ensure_win_codesign_cache
if errorlevel 1 goto :error

rem Refresh JAVA_HOME from the machine environment. This also makes a newly
rem installed JDK available without requiring a logout or reboot.
if not defined JAVA_HOME for /f "usebackq delims=" %%J in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('JAVA_HOME','Machine')"`) do set "JAVA_HOME=%%J"
if defined JAVA_HOME set "PATH=%JAVA_HOME%\bin;%PATH%"
where java.exe >nul 2>&1
if errorlevel 1 (
  echo ERROR: Java was not found. Install JDK 17 and set JAVA_HOME.
  goto :error
)

echo [3/7] Compiling renderer + main (electron-vite)...
call npm run build
if errorlevel 1 goto :error

if exist "dist\win-unpacked" (
  echo       Cleaning previous dist\win-unpacked ...
  rd /S /Q "dist\win-unpacked"
)

echo [4/7] Packaging Windows app directory for Inno Setup...
echo        (Erstellt dist\win-unpacked als Installer-Quelle)
call npx electron-builder --win --dir --publish=never
if errorlevel 1 goto :error

if not exist "dist\win-unpacked\MangaTracker.exe" (
  echo ERROR: dist\win-unpacked\MangaTracker.exe not found.
  goto :error
)

echo [5/7] Building Inno Setup installer...
set "ISCC_EXE="
for %%I in (ISCC.exe) do if not defined ISCC_EXE set "ISCC_EXE=%%~$PATH:I"
if not defined ISCC_EXE if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" set "ISCC_EXE=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not defined ISCC_EXE if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" set "ISCC_EXE=%ProgramFiles%\Inno Setup 6\ISCC.exe"
if not defined ISCC_EXE if exist "%LocalAppData%\Programs\Inno Setup 6\ISCC.exe" set "ISCC_EXE=%LocalAppData%\Programs\Inno Setup 6\ISCC.exe"
if not defined ISCC_EXE if exist "%UserProfile%\scoop\apps\innosetup\current\ISCC.exe" set "ISCC_EXE=%UserProfile%\scoop\apps\innosetup\current\ISCC.exe"

if not defined ISCC_EXE (
  echo ERROR: ISCC.exe not found. Install Inno Setup 6 or add it to PATH.
  goto :error
)

for /f "usebackq delims=" %%V in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Content -Raw 'package.json' | ConvertFrom-Json).version"`) do set "APP_VERSION=%%V"
if not defined APP_VERSION (
  echo ERROR: Unable to read version from package.json.
  goto :error
)

echo        Compiling Inno Setup installer for version !APP_VERSION! ...
"%ISCC_EXE%" "/DMyAppVersion=!APP_VERSION!" "installer\MangaTracker.iss"
if errorlevel 1 goto :error

if not exist "installer\MangaTracker-Installer-!APP_VERSION!.exe" (
  echo ERROR: Inno installer not found in installer\
  goto :error
)

echo [6/7] Building Android web assets and syncing Capacitor...
call npm run build:mobile
if errorlevel 1 goto :error
call npx cap sync android
if errorlevel 1 goto :error

echo [7/7] Building Android release APK and copying artifacts...
pushd "android" >nul
rem Vollstaendiger Pfad statt "call gradlew.bat": ist NoDefaultCurrentDirectoryInExePath
rem gesetzt (z. B. in CI- oder Tool-Shells), durchsucht cmd das aktuelle Verzeichnis
rem nicht und der Aufruf schlaegt mit "Befehl nicht gefunden" fehl.
call "%ROOT%android\gradlew.bat" assembleRelease
if errorlevel 1 (
  popd >nul
  goto :error
)
popd >nul

if not exist "android\app\build\outputs\apk\release\app-release.apk" (
  echo ERROR: app-release.apk not found.
  goto :error
)
echo        Copying app-release.apk ...
copy /Y "android\app\build\outputs\apk\release\app-release.apk" "installer\app-release.apk" >nul

echo.
echo Build finished successfully.
echo.
echo Files in installer\:
dir /B "installer"

popd >nul
exit /B 0

:error
set "BUILD_EXIT_CODE=%ERRORLEVEL%"
if "%BUILD_EXIT_CODE%"=="0" set "BUILD_EXIT_CODE=1"
echo.
echo Build failed with exit code %BUILD_EXIT_CODE%. Check the output above.
if not defined NO_PAUSE (
  echo.
  echo Press any key to close this window...
  pause >nul
)
popd >nul
exit /B %BUILD_EXIT_CODE%

:ensure_win_codesign_cache
rem DisableDelayedExpansion ist hier Pflicht: bei aktivem "!" -Parsing wuerde cmd
rem das Ausrufezeichen aus dem 7za-Ausschlussschalter "-xr!darwin" entfernen und
rem 7-Zip bricht mit "Incorrect wildcard type marker" ab.
setlocal EnableExtensions DisableDelayedExpansion
set "WIN_CODESIGN_VERSION=2.6.0"
set "WIN_CODESIGN_DIR=%ELECTRON_BUILDER_CACHE%\winCodeSign\winCodeSign-%WIN_CODESIGN_VERSION%"
set "WIN_CODESIGN_ARCHIVE=%ELECTRON_BUILDER_CACHE%\winCodeSign\winCodeSign-%WIN_CODESIGN_VERSION%.7z"
set "SEVEN_ZIP=%ROOT%node_modules\7zip-bin\win\x64\7za.exe"

if exist "%WIN_CODESIGN_DIR%\rcedit-x64.exe" exit /B 0

if not exist "%SEVEN_ZIP%" (
  echo ERROR: 7za.exe required by electron-builder was not found.
  exit /B 1
)

if not exist "%ELECTRON_BUILDER_CACHE%\winCodeSign" mkdir "%ELECTRON_BUILDER_CACHE%\winCodeSign"
if errorlevel 1 exit /B 1

if not exist "%WIN_CODESIGN_ARCHIVE%" (
  echo       Downloading winCodeSign %WIN_CODESIGN_VERSION% ...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing 'https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-%WIN_CODESIGN_VERSION%/winCodeSign-%WIN_CODESIGN_VERSION%.7z' -OutFile '%WIN_CODESIGN_ARCHIVE%'"
  if errorlevel 1 (
    echo ERROR: Unable to download winCodeSign %WIN_CODESIGN_VERSION%.
    exit /B 1
  )
)

echo       Preparing winCodeSign cache ...
rem -xr! schliesst den darwin-Ordner samt Unterordnern aus ("-x!darwin\*" wuerde
rem nur die direkten Kinder treffen und die macOS-Symlinks trotzdem entpacken).
"%SEVEN_ZIP%" x -y -bd "%WIN_CODESIGN_ARCHIVE%" "-o%WIN_CODESIGN_DIR%" "-xr!darwin"
if errorlevel 1 (
  echo ERROR: Unable to extract winCodeSign %WIN_CODESIGN_VERSION%.
  exit /B 1
)

if not exist "%WIN_CODESIGN_DIR%\rcedit-x64.exe" (
  echo ERROR: winCodeSign cache is incomplete.
  exit /B 1
)

exit /B 0
