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

# Remove CR's
s/\r//

# Merge lines ending in these characters (without semicolon) with next line
/[][,\{=:\?\)\}]$|else$/ {N ; s/\n */ / ; b start }

# Remove semicolons at end of line
s/;+$//

# Replace (...) => by ... =>
s/ ?\((\w+)\)\s*=>/ \1=>/g

# Remove whitespace before and after special chars, except inside strings
s/ *(^|[-\[(),:;{}<>=?!+*|&]|]|`(\\`|\$\{(`[^`]*`|[^\}])\}|[^`])*`|'(\\'|[^'])*'|\"(\\"|[^\"])*\"|\/(\\.|[^/])*\/) */\1/g

# Remove whitespace in expressions in interpolated strings
t repeat    # Needed to clear previous test result
: repeat
s/^(([^`]|`[^`]*`)*`[^`]*\$\{('(\\'|[^'])*'|\"(\\"|[^\"])*\"|\{[^{}]*\}|[^{}])*)(([-+*/&|?:]) +| +([-+*/&|?:]))/\1\7\8/i
t repeat

# Remove comma and semicolon before ] or } or )
s/[,;]+([]})])/\1/g

# Skip emptylines
/^$/{n;b start} 

# Check next line
N
# If it starts with one of these chars, then merge
/\n\s*[\}\?:]/{ s/\n\s*// ; b start }

# If it starts with ( or [, then merge and (re-)insert semicolon, to prevent unintensional function calls
/\n\s*([[(])/{ s/\n\s*/;/ ; b start }

# Otherwise print up to newline, and restart with the remaining (next) line
P
s/^.*\n//
b start