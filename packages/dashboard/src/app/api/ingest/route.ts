export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getStore } from '@/lib/db';
import { ingestPayload } from '@/lib/ingest';

/** POST { metadata: {repo, branch?, commit?, team?, timestamp?, loc?}, sarif } */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = ingestPayload(getStore(), body, new Date().toISOString());
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
