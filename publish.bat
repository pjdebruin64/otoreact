set Dest=Publish\
call tsc --project tsconfig.2015.json
timeout 2
"C:\Program Files (x86)\GnuWin32\bin\sed.exe" -b -E -f minify.sed OtoReact.js > %Dest%OtoReact_ES2015.js

call tsc --project tsconfig.json
timeout 2
call .\Minify.bat "%Dest%"
