// Demo: exports fetchCart but not fetchCoupons, which cart.ts imports.
import type { Line } from './cart';

export async function fetchCart(id: string): Promise<{ lines: Line[] }> {
  const res = await fetch(`/api/carts/${id}`);
  return res.json();
}

export function settings(opts?: { retries: number }) {
  return opts.retries; // IED-L022: optional parameter used without a check
}
