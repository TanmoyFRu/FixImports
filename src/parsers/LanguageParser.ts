import { FoundImport, InsertionPoint, ImportCategory, FixImportsConfig } from '../core/types';

/**
 * Interface that all language parsers (Python, TypeScript, Go, etc.) must implement.
 * Adding a new language involves implementing this interface and registering it with ParserRegistry.
 */
export interface LanguageParser {
  /** The list of VS Code language identifiers this parser handles (e.g. ['python'] or ['typescript', 'javascript']) */
  readonly languageIds: readonly string[];

  /** Initialize tree-sitter or parser resources */
  init(wasmDirectory: string): Promise<void>;

  /** Whether the parser is ready to parse */
  isInitialized(): boolean;

  /** Find all import statements in the given source text */
  findImports(sourceText: string, config?: FixImportsConfig): FoundImport[];

  /** Determine the optimal insertion point at the top of the file */
  getHeaderInsertionPoint(sourceText: string): InsertionPoint;

  /** Check if two imports are duplicates */
  isDuplicate(existingImport: FoundImport, newImport: FoundImport): boolean;

  /** Categorize an import for grouping (future, stdlib, thirdParty, local) */
  categorizeImport(importStmt: FoundImport): ImportCategory;
}
