// ================================
//  WEIGHT UTILS
// ================================

export function calculateWeightPrice(pricePerKg, grams) {
  return Math.round(pricePerKg * grams / 1000);
}

export function formatWeight(grams) {
  if (grams < 1000) return grams + ' г';
  const kg = grams / 1000;
  return (Number.isInteger(kg) ? kg : parseFloat(kg.toFixed(1))) + ' кг';
}

export function generateWeightOptions(min, max, step) {
  const opts = [];
  for (let g = min; g <= max; g += step) opts.push(g);
  return opts;
}
