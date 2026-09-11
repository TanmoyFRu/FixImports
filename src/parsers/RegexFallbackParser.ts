import {
  FoundImport,
  InsertionPoint,
  ImportCategory,
  FixImportsConfig,
  SourcePosition
} from '../core/types';
import { LanguageParser } from './LanguageParser';

/**
 * Regex-based fallback parser used only when no registered AST parser is available.
 */
export class RegexFallbackParser implements LanguageParser {
  readonly languageIds: readonly string[] = ['*'];

  async init(_wasmDirectory: string): Promise<void> {
    // No WASM needed for regex fallback
  }

  isInitialized(): boolean {
    return true;
  }

  findImports(sourceText: string, config?: FixImportsConfig): FoundImport[] {
    const lines = sourceText.split(/\r?\n/);
    const results: FoundImport[] = [];
    const preserveAllowlist = config?.preserveConditionalImports || [];

    const importRegex = /^\s*(import\s+.+|from\s+.+\s+import\s+.+|const\s+.+\s*=\s*require\(.+\)|var\s+.+\s*=\s*require\(.+\)|let\s+.+\s*=\s*require\(.+\));?$/;

    let inTopBlock = true;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed === '') {
        continue;
      }

      // If line is comment, continue
      if (line.startsWith('#') || line.startsWith('//') || line.startsWith('/*')) {
        continue;
      }

      const match = trimmed.match(importRegex);
      if (match) {
        const indentation = line.match(/^\s*/)?.[0] || '';
        const scope = (inTopBlock && indentation.length === 0) ? 'top' : 'nested';

        const start: SourcePosition = { line: i, character: 0 };
        const end: SourcePosition = { line: i, character: line.length };

        let moduleName = '';
        const fromMatch = trimmed.match(/^from\s+([^\s]+)\s+import/);
        const importMatch = trimmed.match(/^import\s+([^\s,;]+)/);
        const requireMatch = trimmed.match(/require\(['"]([^'"]+)['"]\)/);

        if (fromMatch) {
          moduleName = fromMatch[1];
        } else if (importMatch) {
          moduleName = importMatch[1];
        } else if (requireMatch) {
          moduleName = requireMatch[1];
        }

        const isConditional = preserveAllowlist.some(k => line.includes(k));

        results.push({
          text: line.trim(),
          range: { start, end },
          scope,
          isConditional,
          moduleName,
          indentation
        });
      } else {
        // Non-import line encountered at top level
        if (!line.startsWith('#') && !line.startsWith('//')) {
          inTopBlock = false;
        }
      }
    }

    return results;
  }

  getHeaderInsertionPoint(sourceText: string): InsertionPoint {
    const lines = sourceText.split(/\r?\n/);
    let insertLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('#!') || line.startsWith('//') || line.startsWith('#')) {
        insertLine = i + 1;
        continue;
      }
      if (line.trim().startsWith('import ') || line.trim().startsWith('from ')) {
        insertLine = i + 1;
        continue;
      }
      break;
    }

    return {
      position: { line: insertLine, character: 0 },
      prefixNewlines: 0,
      suffixNewlines: 1
    };
  }

  isDuplicate(existingImport: FoundImport, newImport: FoundImport): boolean {
    return existingImport.text.trim() === newImport.text.trim();
  }

  categorizeImport(importStmt: FoundImport): ImportCategory {
    if (importStmt.moduleName.startsWith('.')) {
      return 'local';
    }
    return 'thirdParty';
  }
}
