import { Issue } from '../rules-engine/types';

export function toJson(issues: Issue[]): string {
  return JSON.stringify({
    schema: 'invisible-errors/v1',
    generatedAt: new Date().toISOString(),
    issueCount: issues.length,
    issues
  }, null, 2);
}
