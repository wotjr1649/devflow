'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sameAccessionLabel } = require('../src/labels.cjs');
const { findAccession } = require('../src/catalogue.cjs');

test('accession label comparison and catalogue lookup', () => {
  assert.equal(sameAccessionLabel('Cafe\u0301-7', 'Café-7'), true);
  assert.equal(sameAccessionLabel('Café-7', 'café-7'), false);
  assert.equal(sameAccessionLabel('Café-7 ', 'Café-7'), false);
  assert.equal(sameAccessionLabel('', ''), true);
  assert.throws(() => sameAccessionLabel(null, 'Café-7'), TypeError);
  assert.throws(() => sameAccessionLabel('Café-7', 7), TypeError);
  const first = { accession: 'Cafe\u0301-7', shelf: 'east' };
  const second = { accession: 'Café-7', shelf: 'west' };
  const records = [first, second];
  const before = JSON.stringify(records);
  assert.equal(findAccession(records, 'Café-7'), first);
  assert.equal(findAccession(records, 'Café-8'), undefined);
  assert.equal(JSON.stringify(records), before);
});
