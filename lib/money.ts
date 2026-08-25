export const INR = 'INR' as const;

export function rupeesToPaise(rupees: number) {
  if (!Number.isFinite(rupees)) throw new Error('Amount must be a finite number');
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number) {
  return paise / 100;
}

export function formatInrPaise(paise: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: INR, maximumFractionDigits: 0 }).format(paiseToRupees(paise));
}
