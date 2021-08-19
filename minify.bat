"C:\Program Files (x86)\GnuWin32\bin\sed.exe" -b -E "s/ *(^|[](),:;{}=?+|&]|`.*?`|'.*?'|\".*?\") */\1/g; s/;*\r$// ; /^$/d" otoreact.js > ..\..\test\otoreact\otoreact.js
copy OtoReact.d.ts ..\..\test\otoreact\
copy OtoReact.ts ..\..\test\otoreact\
copy *.html ..\..\test\otoreact\
copy *.css  ..\..\test\otoreact\
copy samples.js ..\..\test\otoreact\
