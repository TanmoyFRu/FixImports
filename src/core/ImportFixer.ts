import * as vscode from 'vscode';
import { FixImportsConfig, FoundImport, TextEditOperation, SourcePosition, SourceRange } from './types';
import { ParserRegistry } from '../parsers';
import { EditPlanner } from './EditPlanner';
import { getConfiguration } from '../config/settings';

function isPositionBeforeOrEqual(a: SourcePosition, b: SourcePosition): boolean {
  if (a.line !== b.line) {
    return a.line < b.line;
  }
  return a.character <= b.character;
}

function rangesOverlap(a: SourceRange, b: SourceRange): boolean {
  const aEndsBeforeBStarts = isPositionBeforeOrEqual(a.end, b.start);
  const bEndsBeforeAStarts = isPositionBeforeOrEqual(b.end, a.start);
  return !aEndsBeforeBStarts && !bEndsBeforeAStarts;
}

function normalizeRange(input: any): SourceRange | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  if (!input.start || !input.end) {
    return undefined;
  }
  if (typeof input.start.line !== 'number' || typeof input.end.line !== 'number') {
    return undefined;
  }
  // Check if range is empty (single cursor point with no highlighted selection)
  if (input.start.line === input.end.line && input.start.character === input.end.character) {
    return undefined;
  }
  return {
    start: { line: input.start.line, character: input.start.character ?? 0 },
    end: { line: input.end.line, character: input.end.character ?? 0 }
  };
}

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
    selection?: any,
    customConfig?: FixImportsConfig
  ): Promise<{ applied: boolean; count: number }> {
    const config = customConfig || getConfiguration();
    const parser = await this.registry.getParser(document.languageId);

    const sourceText = document.getText();
    const allImports = parser.findImports(sourceText, config);

    // Filter imports that should be moved
    let importsToMove: FoundImport[];

    const validSelection = normalizeRange(selection);

    if (validSelection) {
      // User selected a specific block: only fix misplaced imports overlapping the selection
      importsToMove = allImports.filter(imp => {
        if (imp.scope !== 'nested' || imp.isConditional) {
          return false;
        }
        return rangesOverlap(imp.range, validSelection);
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
