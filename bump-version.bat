@echo off
cd /d "%~dp0"
echo Bump the site version before publishing.
echo   Enter = patch (1.0.0 -^> 1.0.1)
echo   or type: minor / major / an exact version like 1.2.0
set /p KIND=Bump: 
if "%KIND%"=="" set KIND=patch
node scripts\bump-version.mjs %KIND%
pause
