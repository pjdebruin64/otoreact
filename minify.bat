"C:\Program Files (x86)\GnuWin32\bin\sed.exe" -E "s/ *(^|[](),;{=?|&]) */\1/g ; /`/{p;d} ; s/ *([:}]) */\1/g" otoreact.js > ..\..\test\otoreact\otoreact.js
copy OtoReact.d.ts ..\..\test\otoreact\
copy OtoReact.ts ..\..\test\otoreact\
