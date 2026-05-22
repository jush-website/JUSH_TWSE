@echo off
setlocal

:: 設定標題
title TW Stock Analyzer

:: 強制切換編碼為 UTF-8
chcp 65001 > nul

echo [系統] 正在啟動偵測系統...
echo.

:: =============================================================
:: 1. 偵測 Python 環境
:: =============================================================

:: 嘗試偵測 python
python --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set PYTHON_CMD=python
    goto :check_packages
)

:: 嘗試偵測 py
py --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set PYTHON_CMD=py
    goto :check_packages
)

:: 如果都找不到，執行安裝
echo [系統] 找不到 Python，正在啟動自動安裝程序...
set INSTALLER=python_installer.exe
curl -L "https://www.python.org/ftp/python/3.11.5/python-3.11.5-amd64.exe" -o %INSTALLER%

if %ERRORLEVEL% neq 0 (
    echo [失敗] 下載失敗，請檢查網路連線。
    pause
    exit /b 1
)

echo [系統] 正在安裝 Python (請稍候)...
start /wait %INSTALLER% /quiet InstallAllUsers=1 PrependPath=1 Include_test=0
del %INSTALLER%

echo.
echo [+] 安裝完成！請關閉此視窗並重新執行 start_analysis.bat。
pause
exit /b 0

:: =============================================================
:: 2. 檢查套件
:: =============================================================
:check_packages
echo [系統] 偵測到 Python: %PYTHON_CMD%

:: 檢查核心套件 (加入 tqdm 檢查)
%PYTHON_CMD% -c "import pandas, rich, tqdm, FinMind" >nul 2>&1
if %ERRORLEVEL% equ 0 goto :run_app

echo [系統] 正在安裝/修復必要的 Python 套件 (這可能需要 1-2 分鐘)...
%PYTHON_CMD% -m pip install --upgrade pip
%PYTHON_CMD% -m pip install tqdm
%PYTHON_CMD% -m pip install -r src\requirements.txt

if %ERRORLEVEL% neq 0 (
    echo [錯誤] 套件安裝失敗。請檢查網路連線。
    pause
    exit /b 1
)

:: =============================================================
:: 3. 執行程式
:: =============================================================
:run_app
if not exist "src\tw_stock_cli.py" (
    echo [錯誤] 找不到檔案: src\tw_stock_cli.py
    pause
    exit /b 1
)

:: 執行主程式
%PYTHON_CMD% src\tw_stock_cli.py

echo.
echo 執行完畢。
pause
