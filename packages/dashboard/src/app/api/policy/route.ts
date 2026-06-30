export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import * as fs from 'fs';
import * as path from 'path';

/** Form POST: persist the org policy JSON (validated) to .ied-policy.json. */
export async function POST(request: Request) {
  const form = await request.formData();
  const policy = String(form.get('policy') ?? '');
  try {
    JSON.parse(policy); // reject invalid JSON
    fs.writeFileSync(path.join(process.cwd(), '.ied-policy.json'), policy, 'utf8');
  } catch {
    return Response.redirect(new URL('/policies?error=invalid-json', request.url), 303);
  }
  return Response.redirect(new URL('/policies?saved=1', request.url), 303);
}
