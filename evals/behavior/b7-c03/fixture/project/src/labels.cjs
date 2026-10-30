'use strict';

function sameAccessionLabel(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') {
    throw new TypeError('Accession labels must be strings');
  }
  return left.normalize('NFC') === right.normalize('NFC');
}

module.exports = { sameAccessionLabel };
