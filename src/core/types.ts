/**
 * Core types and interfaces for the Fix Imports extension.
 */

export interface SourcePosition {
  line: number;      // 0-indexed line
  character: number; // 0-indexed character
}

export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

export type ImportScope = 'top' | 'nested';

export type ImportCategory = 'future' | 'stdlib' | 'thirdParty' | 'local';

export interface FoundImport {
  /** The full text of the import statement, including comments or multi-line specifiers */
  text: string;
  /** 0-indexed character range in the document */
  range: SourceRange;
  /** Whether the import is located at the top level or nested inside a block */
  scope: ImportScope;
  /**
   * True if the import appears to be an intentional conditional import
   * (e.g. try/except ImportError fallback, if TYPE_CHECKING, etc.)
   */
  isConditional: boolean;
  /** The root module or package name (e.g. 'os', 'typing', 'lodash', './utils') */
  moduleName: string;
  /** Specific imported symbols (e.g. ['sqrt', 'sin']) */
  importedSymbols?: string[];
  /** Is this a 'from ... import ...' statement (Python) or named import? */
  isFromImport?: boolean;
  /** Indentation string of the line where this import is located */
  indentation: string;
  /** Enclosing AST block type (e.g. 'try_statement', 'function_definition', 'if_statement') */
  enclosingBlockType?: string;
  /** Whether removing this import would leave its enclosing block empty */
  leavesBlockEmpty?: boolean;
}

export interface InsertionPoint {
  position: SourcePosition;
  /** Extra blank lines before insertion */
  prefixNewlines: number;
  /** Extra blank lines after insertion */
  suffixNewlines: number;
}

export interface FixImportsConfig {
  preserveConditionalImports: string[];
  sortImportsAfterMove: boolean;
  groupByOrigin: boolean;
  enableDiagnostics: boolean;
  insertPassOnEmptyBlock: boolean;
}

export interface TextEditOperation {
  range: SourceRange;
  newText: string;
}
