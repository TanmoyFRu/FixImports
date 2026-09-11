import * as vscode from 'vscode';
import { ImportFixer } from '../core/ImportFixer';
import { getConfiguration } from '../config/settings';

export class DiagnosticsManager implements vscode.Disposable {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private fixer: ImportFixer;
  private disposables: vscode.Disposable[] = [];
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(fixer: ImportFixer) {
    this.fixer = fixer;
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('fixImports');

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(e => this.triggerDiagnostics(e.document)),
      vscode.workspace.onDidOpenTextDocument(doc => this.triggerDiagnostics(doc)),
      vscode.workspace.onDidCloseTextDocument(doc => {
        this.diagnosticCollection.delete(doc.uri);
        const timer = this.debounceTimers.get(doc.uri.toString());
        if (timer) {
          clearTimeout(timer);
          this.debounceTimers.delete(doc.uri.toString());
        }
      })
    );

    // Initial pass over visible editors
    for (const editor of vscode.window.visibleTextEditors) {
      this.triggerDiagnostics(editor.document);
    }
  }

  triggerDiagnostics(document: vscode.TextDocument): void {
    const config = getConfiguration();
    if (!config.enableDiagnostics) {
      this.diagnosticCollection.clear();
      return;
    }

    // Only inspect supported code files
    const supportedSchemes = ['file', 'untitled'];
    if (!supportedSchemes.includes(document.uri.scheme)) {
      return;
    }

    const uriStr = document.uri.toString();
    const existingTimer = this.debounceTimers.get(uriStr);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(uriStr);
      await this.updateDiagnostics(document);
    }, 300);

    this.debounceTimers.set(uriStr, timer);
  }

  private async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
    try {
      const misplaced = await this.fixer.getMisplacedImports(document);
      const diagnostics: vscode.Diagnostic[] = misplaced.map(imp => {
        const range = new vscode.Range(
          imp.range.start.line,
          imp.range.start.character,
          imp.range.end.line,
          imp.range.end.character
        );

        const diagnostic = new vscode.Diagnostic(
          range,
          `Import statement should be placed at the top header block of the file (${imp.moduleName}).`,
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.code = 'fixImports.misplaced';
        diagnostic.source = 'Fix Imports';
        return diagnostic;
      });

      this.diagnosticCollection.set(document.uri, diagnostics);
    } catch {
      // Gracefully ignore parsing errors while user is actively typing invalid syntax
    }
  }

  dispose(): void {
    this.diagnosticCollection.dispose();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
