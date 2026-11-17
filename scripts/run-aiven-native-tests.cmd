@echo off
setlocal
set "ROOT=%TEMP%\doko-aiven-native-test"
if not exist "%ROOT%\api" mkdir "%ROOT%\api"
if not exist "%ROOT%\tests" mkdir "%ROOT%\tests"
set "BASE=https://raw.githubusercontent.com/mogwaimog-creator/doko-de-mireru/work/aiven-native-connection-20261118"
curl.exe -fsSL "%BASE%/api/_release-transport-candidate.js" -o "%ROOT%\api\_release-transport-candidate.js"
if errorlevel 1 exit /b 1
curl.exe -fsSL "%BASE%/tests/aiven-native-release.test.js" -o "%ROOT%\tests\aiven-native-release.test.js"
if errorlevel 1 exit /b 1
node --test "%ROOT%\tests\aiven-native-release.test.js"
exit /b %errorlevel%
