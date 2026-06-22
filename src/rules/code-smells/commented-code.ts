import { Rule } from '../../rules-engine/types';

/** Contiguous blocks of >3 commented lines that look like code. */
export const commentedCodeRule: Rule = {
  meta: {
    id: 'smell/commented-code',
    name: 'Large commented-out code block',
    description: 'More than three consecutive comment lines that resemble code.',
    category: 'code-smell',
    defaultSeverity: 'info'
  },
  run(ctx) {
    const lines = ctx.sourceText.split(/\r?\n/);
    let runStart = -1, runCount = 0;
    const flush = (endLine: number) => {
      if (runCount > 3) {
        ctx.report({
          message: `Block of ${runCount} commented-out lines.`,
          severity: 'info',
          location: { startLine: runStart + 1, startCol: 1, endLine: endLine, endCol: 1 }
        });
      }
      runStart = -1; runCount = 0;
    };
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i].trim();
      const isCommentLine = ln.startsWith('//') && looksLikeCode(ln.slice(2).trim());
      if (isCommentLine) {
        if (runStart === -1) runStart = i;
        runCount++;
      } else {
        flush(i);
      }
    }
    flush(lines.length);
  }
};

function looksLikeCode(s: string): boolean {
  if (!s) return false;
  return /[;{}()=]|\b(if|for|while|return|const|let|var|function|class|import|export)\b/.test(s);
}
