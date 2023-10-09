SET Dest=%1
echo %Dest%
if "%Dest%"=="" SET Dest=..\..\test\otoreact\
"C:\Program Files (x86)\GnuWin32\bin\sed.exe" -b -E -f minify.sed OtoReact.js > %Dest%OtoReact.js
xcopy /y OtoReact.d.ts %Dest%
xcopy /y OtoReact.ts %Dest%
xcopy /y *.html %Dest%
xcopy /y /s index_files %Dest%
