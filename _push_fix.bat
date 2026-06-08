@echo off
cd /d "%~dp0"
echo Committing altimetry fix...
git add src/components/SSTHeatmapLeaflet.jsx src/components/MapControlPanel.jsx src/pages/SSTLive.jsx
git commit -m "Fix: remove showAltimetry refs, altimetry as data layer"
echo Pushing to GitHub...
git push origin main
echo.
echo Done! Vercel will redeploy in ~1 minute.
pause
