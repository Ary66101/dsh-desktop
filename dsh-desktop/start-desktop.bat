@echo off
setlocal
cd /d "%~dp0"
set "electron_config_cache=%~dp0.electron-cache"

echo [%date% %time%] launch begin, cwd=%CD% >> "%~dp0launch.log"

if not exist "node_modules\electron\dist\electron.exe" (
    echo [%date% %time%] electron missing, installing deps... >> "%~dp0launch.log"
    call npm install --no-audit --no-fund --cache ".npm-cache" >> "%~dp0launch.log" 2>&1
    if errorlevel 1 (
        echo [%date% %time%] npm install FAILED >> "%~dp0launch.log"
        echo Dependency install failed - see launch.log for details, then retry.
        pause
        exit /b 1
    )
)

echo [%date% %time%] launching electron... >> "%~dp0launch.log"
start "" /D "%~dp0" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
echo [%date% %time%] start issued. >> "%~dp0launch.log"
endlocal