# Library interface

`src/labels.cjs` exports `sameAccessionLabel(left, right)`, which returns a boolean for string arguments and raises TypeError for other arguments.

`src/catalogue.cjs` exports `findAccession(records, label)`. Each catalogue entry has a string `accession` field. It returns the first matching entry, or undefined. The catalogue is an in-memory array; no persistence or network service is involved.
