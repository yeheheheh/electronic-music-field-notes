@echo off
setlocal
set "HERE=%~dp0"
if not defined FILM_PYTHON set "FILM_PYTHON=%HERE%..\..\dj-engine\.venv\Scripts\python.exe"
if not exist "%FILM_PYTHON%" (
  echo Set FILM_PYTHON to a Python with numpy, scipy, soundfile and imageio_ffmpeg.
  exit /b 1
)
if not exist "%HERE%assets\automix.png" (
  node "%HERE%render.mjs" assets
  if errorlevel 1 exit /b 1
)
"%FILM_PYTHON%" -B "%HERE%music.py"
if errorlevel 1 exit /b 1
node "%HERE%render.mjs" stills
if errorlevel 1 exit /b 1
node "%HERE%render.mjs" covers
if errorlevel 1 exit /b 1
node "%HERE%render.mjs" video
if errorlevel 1 exit /b 1
"%FILM_PYTHON%" -B "%HERE%finish.py"
if errorlevel 1 exit /b 1
echo Film complete: %HERE%electronic-field-notes-douyin.mp4
endlocal
