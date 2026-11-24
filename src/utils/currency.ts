export const CURRENCY_CODE = 'INR';
export const CURRENCY_SYMBOL = '₹';

export function formatMoney(amount: number, _currency: string = CURRENCY_CODE): string {
  return `${CURRENCY_SYMBOL}${Math.abs(amount).toFixed(2)}`;
}
