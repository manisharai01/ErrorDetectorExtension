export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getStore } from '@/lib/db';

/** GET /api/findings?repo=owner/name[&file=path] */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const repo = params.get('repo');
  if (!repo) {
    return Response.json({ error: 'repo query param is required' }, { status: 400 });
  }
  const file = params.get('file');
  const store = getStore();
  const findings = file ? store.fileFindings(repo, file) : store.repoFindings(repo);
  return Response.json(findings);
}
