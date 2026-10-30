// Postage is charged per started 500 g step; weights are nonnegative integers in grams.
function steps(grams) {
  if (grams === 0) return 0;
  return Math.ceil(grams / 500);
}
module.exports = { steps };
