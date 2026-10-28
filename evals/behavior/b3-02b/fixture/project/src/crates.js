function crates(bottles) {
  if (bottles === 0) return 0;
  return Math.floor(bottles / 6);
}
module.exports = { crates };
