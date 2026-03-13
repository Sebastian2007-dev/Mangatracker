@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
pushd "%ROOT%" >nul

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
if not exist "node_modules" (
  call npm install
  if errorlevel 1 goto :error
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
call gradlew.bat assembleRelease
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
echo.
echo Build failed. Check the output above.
popd >nul
exit /B 1
