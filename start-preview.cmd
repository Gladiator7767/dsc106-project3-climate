@echo off
cd /d "%~dp0"
echo Project 3 preview: http://localhost:8116/
python -m http.server 8116 --bind 127.0.0.1
pause
