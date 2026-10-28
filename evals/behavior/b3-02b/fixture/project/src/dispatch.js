const { crates } = require("./crates");
exports.pickList = bottles => ({ bottles, crates: crates(bottles) });
