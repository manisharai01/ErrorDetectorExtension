/**
 * Hover: when the cursor is over a finding, show the rule name, id, message,
 * and the rule's markdown documentation.
 */
import { fileURLToPath } from 'url';
import {
  MarkupKind,
  type Hover,
  type HoverParams,
  type TextDocuments
} from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { registry } from '@ied/core';
import type { IedSession } from './config';

export async function provideHover(
  params: HoverParams,
  documents: TextDocuments<TextDocument>,
  session: IedSession
): Promise<Hover | null> {
  const doc = documents.get(params.textDocument.uri);
  if (!doc || !session.supports(doc.uri)) return null;

  const result = await session.current.analyzeFile({
    filePath: fileURLToPath(doc.uri),
    content: doc.getText()
  });

  const line = params.position.line;
  const hits = result.diagnostics.filter(
    (d) => line >= d.range.start.row && line <= d.range.end.row
  );
  if (hits.length === 0) return null;

  const sections = hits.map((d) => {
    const rule = registry.get(d.ruleId);
    const docs = rule?.docs ? `\n\n${rule.docs}` : '';
    return `**${d.ruleName}** \`${d.ruleId}\`\n\n${d.message}${docs}`;
  });

  return {
    contents: { kind: MarkupKind.Markdown, value: sections.join('\n\n---\n\n') }
  };
}
