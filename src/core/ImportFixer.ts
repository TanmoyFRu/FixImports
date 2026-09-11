import * as vscode from 'vscode';
import { FixImportsConfig, FoundImport, TextEditOperation } from './types';
import { ParserRegistry } from '../parsers';
import { EditPlanner } from './EditPlanner';
import { getConfiguration } from '../config/settings';

export class ImportFixer {
  private registry: ParserRegistry;

  constructor(registry?: ParserRegistry) {
    this.registry = registry || ParserRegistry.getInstance();
  }

  /**
   * Fix misplaced imports in a document, optionally restricted to a selection.
   */
  async fixImports(
    document: vscode.TextDocument,
    selection?: vscode.Range,
    customConfig?: FixImportsConfig
  ): Promise<{ applied: boolean; count: number }> {
    const config = customConfig || getConfiguration();
    const parser = await this.registry.getParser(document.languageId);

    const sourceText = document.getText();
    const allImports = parser.findImports(sourceText, config);

    // Filter imports that should be moved
    let importsToMove: FoundImport[];

    const hasSelection = selection && !selection.isEmpty;

    if (hasSelection) {
      // User selected a specific block: only fix misplaced imports overlapping the selection
      importsToMove = allImports.filter(imp => {
        if (imp.scope !== 'nested' || imp.isConditional) {
          return false;
        }
        const impRange = new vscode.Range(
          imp.range.start.line,
          imp.range.start.character,
          imp.range.end.line,
          imp.range.end.character
        );
        return selection.intersection(impRange) !== undefined || selection.contains(impRange);
      });
    } else {
      // Whole file: fix all misplaced, non-conditional imports
      importsToMove = allImports.filter(imp => imp.scope === 'nested' && !imp.isConditional);
    }

    if (importsToMove.length === 0) {
      return { applied: false, count: 0 };
    }

    const insertionPoint = parser.getHeaderInsertionPoint(sourceText);
    const edits = EditPlanner.planEdits(
      sourceText,
      allImports,
      importsToMove,
      insertionPoint,
      config,
      parser
    );

    if (edits.length === 0) {
      return { applied: false, count: 0 };
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    const vsEdits = this.toVsCodeEdits(edits);
    workspaceEdit.set(document.uri, vsEdits);

    const success = await vscode.workspace.applyEdit(workspaceEdit);
    return { applied: success, count: importsToMove.length };
  }

  /**
   * Find all misplaced imports in a document for diagnostics / quick fixes.
   */
  async getMisplacedImports(
    document: vscode.TextDocument,
    customConfig?: FixImportsConfig
  ): Promise<FoundImport[]> {
    const config = customConfig || getConfiguration();
    const parser = await this.registry.getParser(document.languageId);
    const sourceText = document.getText();
    const allImports = parser.findImports(sourceText, config);

    return allImports.filter(imp => imp.scope === 'nested' && !imp.isConditional);
  }

  private toVsCodeEdits(edits: TextEditOperation[]): vscode.TextEdit[] {
    return edits.map(e => {
      const range = new vscode.Range(
        e.range.start.line,
        e.range.start.character,
        e.range.end.line,
        e.range.end.character
      );
      return new vscode.TextEdit(range, e.newText);
    });
  }
}
