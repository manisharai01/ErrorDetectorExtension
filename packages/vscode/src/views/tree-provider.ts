import * as vscode from 'vscode';
import * as path from 'path';
import { Diagnostic, Severity } from '@ied/core';
import { DiagnosticProvider } from '../providers/diagnostic-provider';

type Node = FileNode | IssueNode;
class FileNode { constructor(public filePath: string, public issues: Diagnostic[]) {} }
class IssueNode { constructor(public issue: Diagnostic) {} }

export class IssueTreeProvider implements vscode.TreeDataProvider<Node> {
  private emitter = new vscode.EventEmitter<Node | undefined | void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private diagnostics: DiagnosticProvider) {}

  refresh(): void { this.emitter.fire(); }

  getTreeItem(el: Node): vscode.TreeItem {
    if (el instanceof FileNode) {
      const item = new vscode.TreeItem(path.basename(el.filePath), vscode.TreeItemCollapsibleState.Expanded);
      item.description = `${el.issues.length} issue(s)`;
      item.tooltip = el.filePath;
      item.iconPath = new vscode.ThemeIcon('file');
      item.resourceUri = vscode.Uri.file(el.filePath);
      return item;
    }
    const d = el.issue;
    const item = new vscode.TreeItem(d.message, vscode.TreeItemCollapsibleState.None);
    item.description = `${d.ruleId} (line ${d.range.start.row + 1})`;
    item.iconPath = new vscode.ThemeIcon(
      d.severity === Severity.Error ? 'error' : d.severity === Severity.Warning ? 'warning' : 'info'
    );
    item.command = {
      command: 'vscode.open',
      title: 'Open',
      arguments: [vscode.Uri.file(d.filePath), { selection: new vscode.Range(d.range.start.row, d.range.start.column, d.range.end.row, d.range.end.column) }]
    };
    return item;
  }

  getChildren(el?: Node): Node[] {
    if (!el) {
      const grouped = new Map<string, Diagnostic[]>();
      for (const d of this.diagnostics.allIssues()) {
        (grouped.get(d.filePath) ?? grouped.set(d.filePath, []).get(d.filePath)!).push(d);
      }
      return [...grouped.entries()]
        .sort(([, a], [, b]) => b.length - a.length)
        .map(([f, list]) => new FileNode(f, list));
    }
    if (el instanceof FileNode) return el.issues.map(d => new IssueNode(d));
    return [];
  }
}
