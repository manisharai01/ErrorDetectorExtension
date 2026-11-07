// Demo for the whole-project checks (`ied project demo`):
//   - cart.ts and invoice.ts import each other           -> IED-X001 import cycle
//   - this file imports a name api.ts does not export    -> IED-X002 broken import
//   - lineTotal() here and sumLines() in invoice.ts are the same code
//     with different names                               -> IED-X003 duplicate across files
import { invoiceFor } from './invoice';
import { fetchCart, fetchCoupons } from './api';

export interface Line {
  price: number;
  qty: number;
}

export function lineTotal(lines: Line[]): number {
  let total = 0;
  for (const line of lines) {
    if (line.price > 0 && line.qty > 0) {
      total += line.price * line.qty;
    }
  }
  return Math.round(total * 100) / 100;
}

export async function checkoutCart(id: string) {
  const cart = await fetchCart(id);
  const coupons = await fetchCoupons(id);
  return invoiceFor(cart.lines, coupons);
}
