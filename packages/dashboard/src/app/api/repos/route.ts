export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { getStore } from '@/lib/db';

export async function GET() {
  return Response.json(getStore().listRepos());
}
