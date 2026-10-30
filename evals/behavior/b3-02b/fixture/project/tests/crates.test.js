const assert = require("node:assert/strict");
const { crates } = require("../src/crates");
assert.equal(crates(0), 0);
assert.equal(crates(6), 1);
assert.equal(crates(7), 2);
assert.equal(crates(13), 3);
