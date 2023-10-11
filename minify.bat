SET Dest=%1
if "%Dest%"=="" SET Dest=..\..\test\otoreact\
"C:\Program Files (x86)\GnuWin32\bin\sed.exe" -b -E -f minify.sed OtoReact.js > %Dest%OtoReact.js
xcopy /y OtoReact.d.ts %Dest%
xcopy /y OtoReact.ts %Dest%
xcopy /y *.html %Dest%
xcopy /y /s/i index_files\* %Dest%index_files\
xcopy /y /s/i routingdemo\* %Dest%routingdemo\
