import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ParserRegistry } from './parsers';
import { ImportFixer } from './core/ImportFixer';
import { DiagnosticsManager } from './ui/Diagnostics';
import { FixImportsCodeActionProvider } from './ui/CodeActions';

let diagnosticsManager: DiagnosticsManager | null = null;

export async function activate(context: vscode.ExtensionContext) {
  // Resolve WASM directory path
  let wasmDir = path.join(context.extensionPath, 'dist', 'wasm');
  if (!fs.existsSync(wasmDir)) {
    wasmDir = path.join(context.extensionPath, 'wasm');
  }

  // Initialize parser registry and tree-sitter wasm
  const registry = ParserRegistry.getInstance();
  try {
    await registry.init(wasmDir);
  } catch (err) {
    console.error('Failed to initialize tree-sitter WASM runtime:', err);
  }

  const fixer = new ImportFixer(registry);

function isRange(arg: unknown): arg is vscode.Range {
  return (
    typeof arg === 'object' &&
    arg !== null &&
    'start' in arg &&
    'end' in arg &&
    typeof (arg as any).start?.line === 'number' &&
    typeof (arg as any).end?.line === 'number'
  );
}

  // Command: Fix Imports (runs on selection or whole file if nothing selected)
  const fixImportsCommand = vscode.commands.registerCommand(
    'fixImports.fixImports',
    async (arg?: unknown) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      // If arg is a Range (e.g. from QuickFix CodeAction), use it.
      // Otherwise, check if user has an active highlighted selection in the editor.
      // If no text is selected (or cursor only), target the whole file.
      let selection: vscode.Range | undefined;
      if (isRange(arg)) {
        selection = arg;
      } else if (editor.selection && !editor.selection.isEmpty) {
        selection = editor.selection;
      } else {
        selection = undefined;
      }

      try {
        const result = await fixer.fixImports(editor.document, selection);
        if (result.applied) {
          vscode.window.setStatusBarMessage(
            `$(check) Fix Imports: Moved ${result.count} misplaced import${result.count > 1 ? 's' : ''} to header`,
            3000
          );
        } else {
          vscode.window.setStatusBarMessage(
            '$(info) Fix Imports: No misplaced imports found to move',
            3000
          );
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`Fix Imports failed: ${err.message || err}`);
      }
    }
  );

  // Command: Fix All in File
  const fixAllInFileCommand = vscode.commands.registerCommand(
    'fixImports.fixAllInFile',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      try {
        const result = await fixer.fixImports(editor.document, undefined);
        if (result.applied) {
          vscode.window.setStatusBarMessage(
            `$(check) Fix Imports: Moved ${result.count} misplaced import${result.count > 1 ? 's' : ''} to header`,
            3000
          );
        } else {
          vscode.window.setStatusBarMessage(
            '$(info) Fix Imports: No misplaced imports found to move',
            3000
          );
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`Fix Imports failed: ${err.message || err}`);
      }
    }
  );

  // Register Code Actions Provider
  const supportedSelector: vscode.DocumentSelector = [
    { language: 'python' },
    { language: 'typescript' },
    { language: 'javascript' },
    { language: 'typescriptreact' },
    { language: 'javascriptreact' }
  ];

  const codeActionProvider = vscode.languages.registerCodeActionsProvider(
    supportedSelector,
    new FixImportsCodeActionProvider(),
    {
      providedCodeActionKinds: FixImportsCodeActionProvider.providedCodeActionKinds
    }
  );

  // Register Diagnostics
  diagnosticsManager = new DiagnosticsManager(fixer);

  context.subscriptions.push(
    fixImportsCommand,
    fixAllInFileCommand,
    codeActionProvider,
    diagnosticsManager
  );
}

export function deactivate() {
  if (diagnosticsManager) {
    diagnosticsManager.dispose();
    diagnosticsManager = null;
  }
}
