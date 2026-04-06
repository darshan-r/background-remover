@echo off
setlocal

set "ROOT_DIR=%~dp0"
set "PYTHON_EXE=%ROOT_DIR%.venv\Scripts\python.exe"

if not exist "%PYTHON_EXE%" (
    echo Workspace virtual environment not found at ".venv\Scripts\python.exe".
    echo Run "uv sync" first, then try again.
    exit /b 1
)

pushd "%ROOT_DIR%"
"%PYTHON_EXE%" main.py
set "EXIT_CODE=%ERRORLEVEL%"
popd

exit /b %EXIT_CODE%
