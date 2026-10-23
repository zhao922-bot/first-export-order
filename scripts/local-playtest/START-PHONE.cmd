@echo off
setlocal
chcp 65001 >nul
title First Export - Phone LAN Playtest
if not exist "%~dp0runtime\node.exe" goto missing
"%~dp0runtime\node.exe" "%~dp0server.mjs" --lan --open %*
set "PLAYTEST_EXIT=%ERRORLEVEL%"
if not "%PLAYTEST_EXIT%"=="0" if not "%PLAYTEST_NO_PAUSE%"=="1" pause
exit /b %PLAYTEST_EXIT%
:missing
echo Runtime missing. Extract the entire ZIP first. Read TROUBLESHOOTING.txt.
if not "%PLAYTEST_NO_PAUSE%"=="1" pause
exit /b 1
