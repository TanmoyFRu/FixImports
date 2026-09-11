import {
  FoundImport,
  InsertionPoint,
  FixImportsConfig,
  TextEditOperation,
  SourcePosition,
  SourceRange
} from './types';
import { LanguageParser } from '../parsers/LanguageParser';

export class EditPlanner {
  /**
   * Plan text edits to move misplaced imports to the top header.
   */
  static planEdits(
    sourceText: string,
    allImports: FoundImport[],
    importsToMove: FoundImport[],
    insertionPoint: InsertionPoint,
    config: FixImportsConfig,
    parser: LanguageParser
  ): TextEditOperation[] {
    if (importsToMove.length === 0) {
      return [];
    }

    const edits: TextEditOperation[] = [];
    const lines = sourceText.split(/\r?\n/);
    const isPython = parser.languageIds.includes('python');

    // 1. Remove misplaced imports from their current locations
    // Sort importsToMove in reverse order of position so deletions don't shift line numbers if applied sequentially
    const sortedImportsToRemove = [...importsToMove].sort((a, b) => {
      if (a.range.start.line !== b.range.start.line) {
        return b.range.start.line - a.range.start.line;
      }
      return b.range.start.character - a.range.start.character;
    });

    for (const imp of sortedImportsToRemove) {
      const lineIndex = imp.range.start.line;
      const lineText = lines[lineIndex] || '';
      const trimmed = lineText.trim();

      // Check if import statement takes up the whole line (except indentation)
      const isFullLine =
        trimmed === imp.text.trim() ||
        trimmed === imp.text.trim() + ';' ||
        imp.text.trim().startsWith(trimmed);

      if (isFullLine) {
        if (isPython && imp.leavesBlockEmpty && config.insertPassOnEmptyBlock) {
          // Replace with indented 'pass' to preserve valid Python syntax
          const indent = imp.indentation || '    ';
          const range: SourceRange = {
            start: { line: lineIndex, character: 0 },
            end: { line: lineIndex, character: lineText.length }
          };
          edits.push({
            range,
            newText: `${indent}pass`
          });
        } else {
          // Delete entire line including line ending
          const hasNextLine = lineIndex < lines.length - 1;
          const start: SourcePosition = { line: lineIndex, character: 0 };
          const end: SourcePosition = hasNextLine
            ? { line: lineIndex + 1, character: 0 }
            : { line: lineIndex, character: lineText.length };

          edits.push({
            range: { start, end },
            newText: ''
          });
        }
      } else {
        // Inline statement: delete just the import range
        edits.push({
          range: imp.range,
          newText: ''
        });
      }
    }

    // 2. Filter out duplicates
    const topLevelImports = allImports.filter(i => i.scope === 'top');
    const uniqueImportsToInsert: FoundImport[] = [];

    for (const toMove of importsToMove) {
      // Check if it's duplicate of existing top-level import
      const isDupOfTop = topLevelImports.some(topImp =>
        parser.isDuplicate(topImp, toMove)
      );
      if (isDupOfTop) {
        continue;
      }

      // Check if duplicate of another import in the moving batch
      const isDupOfBatch = uniqueImportsToInsert.some(batchImp =>
        parser.isDuplicate(batchImp, toMove)
      );
      if (isDupOfBatch) {
        continue;
      }

      uniqueImportsToInsert.push(toMove);
    }

    if (uniqueImportsToInsert.length === 0) {
      return edits; // Imports were removed/deduped, nothing new to insert
    }

    // 3. Sort and group imports
    const formattedText = this.formatImportsForInsertion(
      uniqueImportsToInsert,
      config,
      parser,
      insertionPoint
    );

    // 4. Create insertion edit at insertionPoint
    edits.push({
      range: {
        start: insertionPoint.position,
        end: insertionPoint.position
      },
      newText: formattedText
    });

    return edits;
  }

  private static formatImportsForInsertion(
    imports: FoundImport[],
    config: FixImportsConfig,
    parser: LanguageParser,
    insertionPoint: InsertionPoint
  ): string {
    let result = '';

    if (config.groupByOrigin) {
      const groups: Record<string, FoundImport[]> = {
        future: [],
        stdlib: [],
        thirdParty: [],
        local: []
      };

      for (const imp of imports) {
        const category = parser.categorizeImport(imp);
        groups[category].push(imp);
      }

      const groupOrder = ['future', 'stdlib', 'thirdParty', 'local'];
      const textBlocks: string[] = [];

      for (const groupKey of groupOrder) {
        const groupItems = groups[groupKey];
        if (groupItems.length === 0) {
          continue;
        }

        if (config.sortImportsAfterMove) {
          groupItems.sort((a, b) => a.text.localeCompare(b.text));
        }

        const block = groupItems.map(i => i.text.trim()).join('\n');
        textBlocks.push(block);
      }

      result = textBlocks.join('\n\n');
    } else {
      const sorted = [...imports];
      if (config.sortImportsAfterMove) {
        sorted.sort((a, b) => a.text.localeCompare(b.text));
      }
      result = sorted.map(i => i.text.trim()).join('\n');
    }

    // Add prefix newlines if needed
    const prefix = '\n'.repeat(insertionPoint.prefixNewlines);
    // Add suffix newlines
    const suffix = '\n'.repeat(Math.max(1, insertionPoint.suffixNewlines));

    return prefix + result + suffix;
  }
}
