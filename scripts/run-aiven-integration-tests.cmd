@echo off
setlocal
set "ROOT=%TEMP%\doko-aiven-integration"
set "ZIP=%TEMP%\doko-aiven-integration.zip"
set "URL=https://github.com/mogwaimog-creator/doko-de-mireru/archive/refs/heads/work/aiven-native-connection-20261118.zip"
echo Downloading test branch...
curl.exe -fL "%URL%" -o "%ZIP%"
if errorlevel 1 exit /b 1
if exist "%ROOT%" rmdir /s /q "%ROOT%"
mkdir "%ROOT%"
tar.exe -xf "%ZIP%" -C "%ROOT%" --strip-components=1
if errorlevel 1 exit /b 1
cd /d "%ROOT%"
echo Installing declared dependencies...
call npm ci --ignore-scripts --no-audit --no-fund
if errorlevel 1 exit /b 1
echo Running native transport and streaming schedule tests...
node --test tests/aiven-native-release.test.js tests/aiven-native-client.test.js tests/streaming-update-schedule.test.js tests/streaming-ledger-service.test.js tests/paused-ledger-reads.test.js tests/seo-detail-renderer.test.js
exit /b %errorlevel%
