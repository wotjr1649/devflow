'use strict';

const { sameAccessionLabel } = require('./labels.cjs');

function findAccession(records, label) {
  return records.find(record => sameAccessionLabel(record.accession, label));
}

module.exports = { findAccession };
