/**
 * Slack notifier adapter (incoming webhook).
 *  - quality-gate-failure notification
 *  - weekly digest (score trend, new findings, top rule violations)
 *  - @mention the commit author when they introduce a security finding
 */
import type {
  Digest,
  FetchLike,
  Notifier,
  QualityGate,
  RepoContext,
  ScanFinding
} from './types';

export interface SlackConfig {
  webhookUrl: string;
  /** Inject for tests; defaults to global fetch. */
  fetchImpl?: FetchLike;
}

export class SlackIntegration implements Notifier {
  readonly name = 'slack';
  constructor(private readonly config: SlackConfig) {}

  private get f(): FetchLike {
    return this.config.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  }

  private async post(text: string): Promise<void> {
    const res = await this.f(this.config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!res.ok) throw new Error(`Slack webhook failed (HTTP ${res.status})`);
  }

  async qualityGateFailed(gate: QualityGate, ctx: RepoContext): Promise<void> {
    const where = `*${ctx.repo}*${ctx.branch ? ` (${ctx.branch})` : ''}`;
    const lines = gate.failures.map((x) => `• ${x}`).join('\n');
    await this.post(`:rotating_light: *Quality gate failed* for ${where}\n${lines}`);
  }

  async weeklyDigest(d: Digest): Promise<void> {
    const trend =
      d.scoreTrend === undefined ? '' : ` (${d.scoreTrend >= 0 ? '+' : ''}${d.scoreTrend})`;
    const top = d.topRules.map((r) => `${r.ruleId} (${r.count})`).join(', ') || 'none';
    await this.post(
      `:bar_chart: *Weekly digest — ${d.repo}* (last ${d.periodDays}d)\n` +
        `Quality score: *${d.score}*${trend}\n` +
        `New findings: ${d.newFindings}\n` +
        `Top rules: ${top}`
    );
  }

  async securityFindingIntroduced(finding: ScanFinding, ctx: RepoContext): Promise<void> {
    const who = ctx.author ? `<@${ctx.author}> ` : '';
    await this.post(
      `:lock: ${who}introduced a security finding in *${ctx.repo}*: ` +
        `*${finding.ruleId}* — ${finding.message} (${finding.filePath}:${finding.line})`
    );
  }
}
