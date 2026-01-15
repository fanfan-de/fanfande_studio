@echo off
setlocal enabledelayedexpansion

set "source=E:\Project\opencode\packages\opencode"
set "dest=E:\Project\fanfande_studio\fanfande_studio_vault\opencode"

rem Ensure source and dest end with backslash
if not "%source:~-1%"=="\" set "source=%source%\"
if not "%dest:~-1%"=="\" set "dest=%dest%\"

echo Creating directory structure...
xcopy "%source%*" "%dest%" /t /e /i /q

echo Creating empty .md files...
for /r "%source%" %%f in (*) do (
    set "srcfile=%%f"
    set "filename=%%~nxf"
    set "basename=%%~nf"
    set "destfile=!srcfile:%source%=%dest%!"
    set "destdir=!destfile:%filename%=!"
    if not exist "!destdir!" mkdir "!destdir!"
    set "newfile=!destdir!!basename!.md"
    echo. > "!newfile!"
)

echo Done.