export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getStore } from '@/lib/db';

/** Form POST: mark a finding (by fingerprint) as a false positive. */
export async function POST(request: Request) {
  const form = await request.formData();
  const fingerprint = String(form.get('fingerprint') ?? '');
  const ruleId = form.get('ruleId') ? String(form.get('ruleId')) : undefined;
  const redirect = String(form.get('redirect') ?? '/');
  if (fingerprint) {
    getStore().markFalsePositive(fingerprint, ruleId, new Date().toISOString());
  }
  return Response.redirect(new URL(redirect, request.url), 303);
}
