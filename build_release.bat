@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
pushd "%ROOT%" >nul

echo [1/6] Preparing installer directory...
if not exist "installer" mkdir "installer"

rem Remove files in installer except .iss templates.
for %%F in ("installer\*") do (
  if /I not "%%~xF"==".iss" del /F /Q "%%~fF" >nul 2>&1
)

rem Remove all subdirectories under installer.
for /D %%D in ("installer\*") do (
  rd /S /Q "%%~fD" >nul 2>&1
)

echo [2/6] Ensuring dependencies are present...
if not exist "node_modules" (
  call npm install
  if errorlevel 1 goto :error
)

echo [3/6] Building Windows installer (.exe)...
call npm run dist
if errorlevel 1 goto :error

echo [4/6] Building Android web assets and syncing Capacitor...
call npm run mobile
if errorlevel 1 goto :error

echo [5/6] Building Android release APK...
pushd "android" >nul
call gradlew.bat assembleRelease
if errorlevel 1 (
  popd >nul
  goto :error
)
popd >nul

echo [6/6] Copying artifacts to installer...
set "EXE_COUNT=0"
for %%F in ("dist\*.exe") do (
  copy /Y "%%~fF" "installer\" >nul
  set /A EXE_COUNT+=1
)

if !EXE_COUNT! EQU 0 (
  echo ERROR: No .exe file found in dist\
  goto :error
)

if not exist "android\app\build\outputs\apk\release\app-release.apk" (
  echo ERROR: app-release.apk not found.
  goto :error
)
copy /Y "android\app\build\outputs\apk\release\app-release.apk" "installer\app-release.apk" >nul

echo.
echo Build finished successfully.
echo Files in installer:
dir /B "installer"

popd >nul
exit /B 0

:error
echo.
echo Build failed. Check the logs above.
popd >nul
exit /B 1
