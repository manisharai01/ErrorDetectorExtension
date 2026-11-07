// Demo: the other half of the cart.ts <-> invoice.ts import cycle, and a
// copy of cart.ts's lineTotal() under another name.
import { lineTotal, type Line } from './cart';

export function sumLines(items: Line[]): number {
  let sum = 0;
  for (const item of items) {
    if (item.price > 0 && item.qty > 0) {
      sum += item.price * item.qty;
    }
  }
  return Math.round(sum * 100) / 100;
}

export function invoiceFor(lines: Line[], coupons: string[]) {
  return { total: lineTotal(lines), coupons };
}
