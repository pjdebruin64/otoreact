set Dest=Publish\
call tsc --project ./tsconfig.json
pause
call .\Minify.bat %Dest%
pause
del ./otoreact.js
call tsc --project ./tsconfig.2015.json
pause
"C:\Program Files (x86)\GnuWin32\bin\sed.exe" -b -E -f minify.sed OtoReact.js > %Dest%OtoReact_ES2015.js
