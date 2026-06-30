export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getStore } from '@/lib/db';

/** GET /api/trends[?repo=owner/name] — repo trend, or the org-wide trend. */
export async function GET(request: Request) {
  const repo = new URL(request.url).searchParams.get('repo');
  const store = getStore();
  if (repo) return Response.json(store.repoTrend(repo));
  return Response.json(store.orgOverview().trend);
}
