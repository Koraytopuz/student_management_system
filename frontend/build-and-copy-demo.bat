@echo off
echo ================================
echo Student Management - Demo Build
echo ================================
echo.

echo [1/2] Frontend build aliniyor...
call npx vite build
if errorlevel 1 (
    echo HATA: Build basarisiz!
    pause
    exit /b 1
)
echo.

echo [2/2] skyweb\demo klasorune kopyalaniyor...
set SKYWEB=..\..\..\skyweb
if not exist "%SKYWEB%" (
    echo HATA: skyweb klasoru bulunamadi. Yol: %SKYWEB%
    pause
    exit /b 1
)

if not exist "%SKYWEB%\demo" mkdir "%SKYWEB%\demo"
xcopy /E /I /Y dist\* "%SKYWEB%\demo\" >nul
echo [OK] %SKYWEB%\demo guncellendi
echo.
echo Simdi skyweb klasorunde build-for-plesk.bat calistirin.
pause
