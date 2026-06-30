/**
 * Jira issue-tracker adapter.
 *  - auto-create tickets from findings
 *  - link TODO comments to existing ticket ids (extractIssueRef)
 *  - transition a ticket's status when a finding is resolved
 *
 * Uses the Jira Cloud REST v3 API with Basic auth (email + API token).
 */
import type { CreatedIssue, FetchLike, IssueTracker, RepoContext, ScanFinding } from './types';

export interface JiraConfig {
  baseUrl: string; // e.g. https://acme.atlassian.net
  email: string;
  apiToken: string;
  projectKey: string; // e.g. SEC
  issueType?: string; // default "Bug"
  /** Inject for tests; defaults to global fetch. */
  fetchImpl?: FetchLike;
}

const TICKET_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/;

export class JiraIntegration implements IssueTracker {
  readonly name = 'jira';
  constructor(private readonly config: JiraConfig) {}

  private get f(): FetchLike {
    return this.config.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  }

  private authHeader(): string {
    const token = Buffer.from(`${this.config.email}:${this.config.apiToken}`).toString('base64');
    return `Basic ${token}`;
  }

  async createIssueFromFinding(finding: ScanFinding, ctx: RepoContext): Promise<CreatedIssue> {
    const summary = `[${finding.ruleId}] ${finding.message}`.slice(0, 240);
    const description = [
      `Repository: ${ctx.repo}${ctx.branch ? `@${ctx.branch}` : ''}`,
      `Location: ${finding.filePath}:${finding.line}`,
      `Rule: ${finding.ruleId} (${finding.severity})`,
      ctx.commit ? `Commit: ${ctx.commit}` : ''
    ]
      .filter(Boolean)
      .join('\n');

    const body = {
      fields: {
        project: { key: this.config.projectKey },
        summary,
        description,
        issuetype: { name: this.config.issueType ?? 'Bug' }
      }
    };

    const res = await this.f(`${this.config.baseUrl}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Jira issue create failed (HTTP ${res.status})`);
    const json = await res.json();
    return { key: json.key, url: `${this.config.baseUrl}/browse/${json.key}` };
  }

  extractIssueRef(text: string): string | null {
    return TICKET_RE.exec(text)?.[1] ?? null;
  }

  async transitionIssue(key: string, toStatus: string): Promise<void> {
    const res = await this.f(`${this.config.baseUrl}/rest/api/3/issue/${key}/transitions`, {
      method: 'POST',
      headers: { Authorization: this.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ transition: { name: toStatus } })
    });
    if (!res.ok) throw new Error(`Jira transition failed for ${key} (HTTP ${res.status})`);
  }
}
