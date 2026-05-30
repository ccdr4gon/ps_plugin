@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul 2>nul
cd /d "C:\Users\ccdragon\_code\ps_plugin\uxp-hybrid\addon"
cl /nologo /LD /MT /EHsc /O2 /utf-8 /std:c++17 /I src\api /I src\utilities src\module.cpp src\utilities\UxpAddon.cpp src\utilities\UxpTask.cpp src\utilities\UxpValue.cpp /Fe:ColorPaletteSampler.uxpaddon /link user32.lib gdi32.lib
