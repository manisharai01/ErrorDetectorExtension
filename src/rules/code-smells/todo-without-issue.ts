import { Rule } from '../../rules-engine/types';

/** TODO/FIXME/HACK comments without a tracker reference (e.g. JIRA-123, #123). */
export const todoWithoutIssueRule: Rule = {
  meta: {
    id: 'smell/todo-no-issue',
    name: 'TODO/FIXME without tracker reference',
    description: 'TODO comments must reference an issue id like JIRA-123, GH-123 or #123.',
    category: 'code-smell',
    defaultSeverity: 'info'
  },
  run(ctx) {
    const lines = ctx.sourceText.split(/\r?\n/);
    const re = /(?:^|\s)(?:\/\/|\/\*|\*)\s*(TODO|FIXME|HACK|XXX)\b([^\n]*)/i;
    const tracker = /([A-Z][A-Z0-9]+-\d+|#\d+|GH-\d+)/;
    for (let i = 0; i < lines.length; i++) {
      const m = re.exec(lines[i]);
      if (!m) continue;
      const tail = m[2];
      if (!tracker.test(tail)) {
        const col = lines[i].indexOf(m[1]) + 1;
        ctx.report({
          message: `${m[1].toUpperCase()} comment without an issue tracker reference.`,
          severity: 'info',
          location: { startLine: i + 1, startCol: col, endLine: i + 1, endCol: col + m[1].length }
        });
      }
    }
  }
};
