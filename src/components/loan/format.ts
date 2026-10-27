export const inr = (value: number, digits = 0) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;

export const pct = (value: number, digits = 2) => `${(value * 100).toFixed(digits)}%`;

export const compactInr = (value: number) => {
  const v = Number(value || 0);
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)} L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)} K`;
  return inr(v);
};
