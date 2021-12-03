# Insert copyright notice
1i /* Copyright 2021 Peter J. de Bruin (peter@peterdebruin.net)
1i *  See https://otoreact.dev/download for license information
1i */

# Remove whitespace before and after special chars, except inside strings
s/ *(^|[-[(),:;{}<>=?+|&]|]|`.*`|'[^']*'|\".*\"|\/.*\/) */\1/g

s/(.);?\r$/\1/         # Remove any semicolons and CR at end of non-empty line
s/[,;]+([]}])/\1/g   # and comma's and semicolons before closing brackets and braces

s/^\(_/;\(_/    # Put a semicolon before "(_" at beginning of line; needed for TypeScript < ES2020
/^$/d           # Remove empty lines