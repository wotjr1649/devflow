export function lineTotal(unitCents, quantity, taxRate = 0) {
  const net = unitCents * quantity;
  return Math.round(net * (1 + taxRate));
}
