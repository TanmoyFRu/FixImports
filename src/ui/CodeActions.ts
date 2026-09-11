import * as vscode from 'vscode';

export class FixImportsCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix
  ];

  provideCodeActions(
    _document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const hasFixImportDiagnostic = context.diagnostics.some(
      d => d.code === 'fixImports.misplaced'
    );

    if (!hasFixImportDiagnostic) {
      return [];
    }

    const quickFix = new vscode.CodeAction(
      'Fix Import: Move to top of file',
      vscode.CodeActionKind.QuickFix
    );
    quickFix.command = {
      command: 'fixImports.fixImports',
      title: 'Fix Import',
      arguments: [range]
    };
    quickFix.isPreferred = true;

    const fixAll = new vscode.CodeAction(
      'Fix all misplaced imports in file',
      vscode.CodeActionKind.QuickFix
    );
    fixAll.command = {
      command: 'fixImports.fixAllInFile',
      title: 'Fix All Imports in File'
    };

    return [quickFix, fixAll];
  }
}
