SET Dest=%1
echo %Dest%
if "%Dest%"=="" SET Dest=..\..\test\otoreact\
"C:\Program Files (x86)\GnuWin32\bin\sed.exe" -b -E -f minify.sed OtoReact.js > %Dest%OtoReact.js
copy OtoReact.d.ts %Dest%
copy OtoReact.ts %Dest%
copy *.shtml %Dest%
copy index_files %Dest%
