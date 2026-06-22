import * as vscode from 'vscode';
import * as path from 'path';
import { DiagnosticProvider } from '../providers/diagnostic-provider';
import { Issue } from '../rules-engine/types';

type Node = FileNode | IssueNode;
class FileNode { constructor(public filePath: string, public issues: Issue[]) {} }
class IssueNode { constructor(public issue: Issue) {} }

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
    const i = el.issue;
    const item = new vscode.TreeItem(i.message, vscode.TreeItemCollapsibleState.None);
    item.description = `${i.ruleId} (line ${i.location.startLine})`;
    item.iconPath = new vscode.ThemeIcon(
      i.severity === 'error' ? 'error' : i.severity === 'warning' ? 'warning' : 'info'
    );
    item.command = {
      command: 'vscode.open',
      title: 'Open',
      arguments: [vscode.Uri.file(i.filePath), { selection: new vscode.Range(i.location.startLine - 1, i.location.startCol - 1, i.location.endLine - 1, i.location.endCol - 1) }]
    };
    return item;
  }

  getChildren(el?: Node): Node[] {
    if (!el) {
      const grouped = new Map<string, Issue[]>();
      for (const i of this.diagnostics.allIssues()) {
        (grouped.get(i.filePath) ?? grouped.set(i.filePath, []).get(i.filePath)!).push(i);
      }
      return [...grouped.entries()]
        .sort(([, a], [, b]) => b.length - a.length)
        .map(([f, list]) => new FileNode(f, list));
    }
    if (el instanceof FileNode) return el.issues.map(i => new IssueNode(i));
    return [];
  }
}
