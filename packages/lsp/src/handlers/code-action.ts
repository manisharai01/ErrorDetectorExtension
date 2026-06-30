/**
 * Code actions: for each `ied` diagnostic offer (a) the rule's auto-fix if it
 * has one, and (b) a "suppress on this line" action using the right comment
 * syntax for the language (`#` for Python, `//` otherwise).
 */
import { fileURLToPath } from 'url';
import {
  CodeActionKind,
  TextEdit as LspTextEdit,
  type CodeAction,
  type CodeActionParams,
  type TextDocuments,
  type WorkspaceEdit
} from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { registry } from '@ied/core';
import type { IedSession } from './config';

function commentPrefix(uri: string): string {
  return uri.toLowerCase().endsWith('.py') ? '#' : '//';
}

export async function provideCodeActions(
  params: CodeActionParams,
  documents: TextDocuments<TextDocument>,
  session: IedSession
): Promise<CodeAction[]> {
  const doc = documents.get(params.textDocument.uri);
  if (!doc || !session.supports(doc.uri)) return [];

  const iedDiags = params.context.diagnostics.filter((d) => d.source === 'ied');
  if (iedDiags.length === 0) return [];

  const actions: CodeAction[] = [];
  const text = doc.getText();

  // Recompute core diagnostics once so we can hand a real Diagnostic to rule.fix.
  const result = await session.current.analyzeFile({ filePath: fileURLToPath(doc.uri), content: text });

  for (const lspDiag of iedDiags) {
    const ruleId = String(lspDiag.code ?? '');
    const rule = registry.get(ruleId);
    const core = result.diagnostics.find(
      (d) => d.ruleId === ruleId && d.range.start.row === lspDiag.range.start.line
    );

    if (rule?.fix && core) {
      const edits = rule.fix(core, text);
      if (edits && edits.length > 0) {
        const lspEdits = edits.map((e) =>
          LspTextEdit.replace(
            { start: doc.positionAt(e.startIndex), end: doc.positionAt(e.endIndex) },
            e.newText
          )
        );
        const edit: WorkspaceEdit = { changes: { [doc.uri]: lspEdits } };
        actions.push({
          title: `Fix: ${ruleId}`,
          kind: CodeActionKind.QuickFix,
          diagnostics: [lspDiag],
          isPreferred: true,
          edit
        });
      }
    }

    // Suppress-on-this-line.
    const line = lspDiag.range.start.line;
    const lineText = doc.getText({ start: { line, character: 0 }, end: { line, character: 4096 } });
    const indent = /^\s*/.exec(lineText)?.[0] ?? '';
    const prefix = commentPrefix(doc.uri);
    const suppressEdit: WorkspaceEdit = {
      changes: {
        [doc.uri]: [
          LspTextEdit.insert({ line, character: 0 }, `${indent}${prefix} ied-disable-next-line ${ruleId}\n`)
        ]
      }
    };
    actions.push({
      title: `Suppress ${ruleId} on this line`,
      kind: CodeActionKind.QuickFix,
      diagnostics: [lspDiag],
      edit: suppressEdit
    });
  }

  return actions;
}
