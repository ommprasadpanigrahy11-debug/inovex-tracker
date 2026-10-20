@echo off
title Inovex Tracker - Standalone Desktop Agent
echo ========================================================================
echo        INOVEX TRACKER - STANDALONE DESKTOP AGENT (NO BROWSER)
echo ========================================================================
echo Initializing standalone agent runtime...
cd /d "%~dp0"
node agent.js
pause
