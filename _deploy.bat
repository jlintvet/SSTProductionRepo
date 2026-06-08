@echo off
echo Deploying SST frontend to Vercel...
cd /d "%~dp0"

REM Check if this folder is a git repo
git status >nul 2>&1
if %errorlevel% neq 0 (
    echo This folder is not a git repo. Trying to find ProductionSST...
    REM Try common locations
    for %%d in ("%USERPROFILE%\ProductionSST" "%USERPROFILE%\Documents\ProductionSST" "%USERPROFILE%\Desktop\ProductionSST" "C:\ProductionSST") do (
        if exist "%%d\.git" (
            echo Found repo at %%d
            cd /d "%%d"
            goto :found
        )
    )
    echo Could not find ProductionSST git repo. Please run from inside the repo.
    pause
    exit /b 1
)

:found
echo Copying changed files...
xcopy /y "%~dp0src\pages\SSTLive.jsx" "src\pages\" 2>nul
xcopy /y "%~dp0src\components\SSTHeatmapLeaflet.jsx" "src\components\" 2>nul
xcopy /y "%~dp0src\components\MapControlPanel.jsx" "src\components\" 2>nul

git add src/pages/SSTLive.jsx src/components/SSTHeatmapLeaflet.jsx src/components/MapControlPanel.jsx
git commit -m "Add ocean currents + altimetry layers (Pro tier)" --allow-empty
git push origin main

echo.
echo Done! Vercel will deploy in ~1 minute.
pause
