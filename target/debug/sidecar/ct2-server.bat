@echo off
REM BlinkStream CTranslate2 sidecar launcher (Python)
REM Requires: Python 3.8+ and ctranslate2 (pip install ctranslate2)
REM Tries python, python3, then py -3

set SCRIPT=%~dp0ct2_server.py

REM Check if script exists
if not exist "%SCRIPT%" (
    echo {"status": "error", "message": "ct2_server.py not found alongside ct2-server.bat"} >&2
    exit /b 1
)

REM Try python first
python --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    python "%SCRIPT%" %*
    exit /b %ERRORLEVEL%
)

REM Try python3
python3 --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    python3 "%SCRIPT%" %*
    exit /b %ERRORLEVEL%
)

REM Try Windows py launcher
py -3 --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    py -3 "%SCRIPT%" %*
    exit /b %ERRORLEVEL%
)

REM No Python found
echo {"status": "error", "message": "Python not found. Install Python 3.8+ and run: pip install ctranslate2"} >&2
exit /b 1
