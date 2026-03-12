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

echo [4/7] Packaging Windows installer (.exe) via electron-builder...
echo        (NSIS-Kompilierung kann 1-2 Minuten dauern - bitte warten)
call npx electron-builder --win --publish=never
if errorlevel 1 goto :error

echo [5/7] Building Android web assets and syncing Capacitor...
call npm run build:mobile
if errorlevel 1 goto :error
call npx cap sync android
if errorlevel 1 goto :error

echo [6/7] Building Android release APK...
pushd "android" >nul
call gradlew.bat assembleRelease
if errorlevel 1 (
  popd >nul
  goto :error
)
popd >nul

echo [7/7] Copying artifacts to installer\...
set "EXE_COUNT=0"
for %%F in ("dist\*.exe") do (
  echo        Copying %%~nxF ...
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
