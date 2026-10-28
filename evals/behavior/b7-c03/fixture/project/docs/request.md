# Accession desk request

Labels entered on different keyboards sometimes have different Unicode representations.

"Two labels match when their NFC-normalized strings are equal."
"Matching remains case-sensitive, and leading or trailing whitespace remains significant."
"Non-string arguments continue to raise TypeError."
"The catalogue lookup uses the same comparison and returns the first matching entry."

The comparison and lookup leave their inputs unchanged and perform no external I/O.
