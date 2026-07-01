export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getStore } from '@/lib/db';
import { ingestHotspotPayload } from '@/lib/ingest-hotspots';

/** POST { metadata: {repo, branch?, commit?, team?, timestamp?}, hotspots: [...] } */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = ingestHotspotPayload(getStore(), body, new Date().toISOString());
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
