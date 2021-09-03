Remove whitespace before and after special chars, except inside strings
s/ *(^|[](),:;{}<>=?+|&]|`.*`|'[^']*'|\"[^\"\"]*\") */\1/g

s/(.);?\r$/\1/         # Remove any semicolons and CR at end of non-empty line
s/[,;]+([\]\}])/\1/g   

s/^\(_/;\(_/   # Put a semicolon before "(_" at beginning of line; needed for TypeScript < ES2020
/^$/d         # Remove emptylines