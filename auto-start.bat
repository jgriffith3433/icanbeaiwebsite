@echo off
cd /d "%~dp0"
if not exist node_modules\@babylonjs\havok (
  echo Installing dependencies...
  call npm install
)
echo Starting local dev server (npm run dev)...
echo I can be site: http://localhost:8092
start "" "http://localhost:8092/"
call npm run dev -- --host 0.0.0.0 --port 8092
