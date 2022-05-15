# Insert copyright notice with date
x
s/.*/dir otoreact.ts/ ; e
s/^.*(..)-(..)-(....).*/\/* OtoReact version \3-\2-\1/ ; p
i\
* Copyright 2022 Peter J. de Bruin (peter@peterdebruin.net)\
* See https://otoreact.dev/download for license information\
*/
x

: start
s/\r//      # Remove CR's
# Merge lines ending in these characters with next line
/[[,\{\)=:\?]$|else$/ {N ; s/\n */ / ; b start }

# Remove whitespace before and after special chars, except inside strings
s/ *(^|[-\[(),:;{}<>=?!+|&]|]|`.*`|'(\\'|[^'])*'|\"(\\"|[^\"])*\"|\/(\\.|[^/])*\/) */\1/g

# Remove whitespace in expressions in interpolated strings
t repeat
: repeat
s/(`[^`]*\$\{([^{} ]|\{[^{}]*\})*) +/\1/
t repeat

#s/(.);+$/\1/       # Remove semicolons at end of non-empty line
s/[,;]+([]}])/\1/g    # Remove comma and semicolon before ] or }

#s/^\(_/;\(_/   # Put a semicolon before "(_" at beginning of line; needed for TypeScript < ES2020

/^$/d                 # Remove emptylines

# Check next line
N
# If it starts with one of these chars, then merge
/\n\s*[\}\?:]/{ s/\n\s*// ; b start }

# Otherwise print up to newline, and restart with the remaining (next) line
P
s/^.*\n//
b start