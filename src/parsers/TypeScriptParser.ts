import * as path from 'path';
import Parser from 'web-tree-sitter';
import {
  FoundImport,
  InsertionPoint,
  ImportCategory,
  FixImportsConfig,
  SourcePosition
} from '../core/types';
import { LanguageParser } from './LanguageParser';

// Common Node.js builtin modules
const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'fs/promises', 'http', 'http2', 'https', 'inspector',
  'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode',
  'querystring', 'readline', 'repl', 'stream', 'stream/promises', 'string_decoder',
  'timers', 'timers/promises', 'tls', 'trace_events', 'tty', 'url', 'util',
  'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
  'node:assert', 'node:async_hooks', 'node:buffer', 'node:child_process', 'node:crypto',
  'node:dns', 'node:events', 'node:fs', 'node:fs/promises', 'node:http', 'node:https',
  'node:net', 'node:os', 'node:path', 'node:process', 'node:stream', 'node:url', 'node:util', 'node:zlib'
]);

export class TypeScriptParser implements LanguageParser {
  readonly languageIds = [
    'typescript',
    'javascript',
    'typescriptreact',
    'javascriptreact'
  ] as const;

  private parser: Parser | null = null;
  private isLoaded = false;

  async init(wasmDirectory: string): Promise<void> {
    if (this.isLoaded) {
      return;
    }
    const wasmPath = path.join(wasmDirectory, 'tree-sitter-typescript.wasm');
    const Lang = await Parser.Language.load(wasmPath);
    this.parser = new Parser();
    this.parser.setLanguage(Lang);
    this.isLoaded = true;
  }

  isInitialized(): boolean {
    return this.isLoaded && this.parser !== null;
  }

  findImports(sourceText: string, config?: FixImportsConfig): FoundImport[] {
    if (!this.parser) {
      throw new Error('TypeScriptParser is not initialized. Call init() first.');
    }

    const tree = this.parser.parse(sourceText);
    const results: FoundImport[] = [];
    const preserveAllowlist = config?.preserveConditionalImports || [];
    const lines = sourceText.split(/\r?\n/);

    const visit = (node: Parser.SyntaxNode) => {
      // 1. ES import statements: import x from 'x'
      if (node.type === 'import_statement') {
        const importInfo = this.extractEsImport(node, sourceText, lines, preserveAllowlist);
        if (importInfo) {
          results.push(importInfo);
        }
      }

      // 2. CommonJS require variable declarations: const x = require('x')
      if (
        node.type === 'lexical_declaration' ||
        node.type === 'variable_declaration'
      ) {
        const requireInfo = this.extractRequireImport(node, sourceText, lines, preserveAllowlist);
        if (requireInfo) {
          results.push(requireInfo);
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) {
          visit(child);
        }
      }
    };

    visit(tree.rootNode);
    return results;
  }

  private extractEsImport(
    node: Parser.SyntaxNode,
    sourceText: string,
    lines: string[],
    preserveAllowlist: string[]
  ): FoundImport | null {
    const isTopLevel = node.parent?.type === 'program';
    const scope = isTopLevel ? 'top' : 'nested';

    const startPos: SourcePosition = {
      line: node.startPosition.row,
      character: node.startPosition.column
    };
    const endPos: SourcePosition = {
      line: node.endPosition.row,
      character: node.endPosition.column
    };

    const text = sourceText.substring(node.startIndex, node.endIndex);
    const lineText = lines[node.startPosition.row] || '';
    const indentation = lineText.match(/^\s*/)?.[0] || '';

    // Extract module source
    let moduleName = '';
    const sourceNode = node.childForFieldName('source');
    if (sourceNode) {
      moduleName = sourceNode.text.replace(/['"`]/g, '');
    }

    // Extract imported symbols
    const importedSymbols: string[] = [];
    const importClause = node.children.find(c => c.type === 'import_clause');
    if (importClause) {
      for (const child of importClause.children) {
        if (child.type === 'identifier') {
          importedSymbols.push(child.text); // default import
        } else if (child.type === 'named_imports') {
          for (const specifier of child.children) {
            if (specifier.type === 'import_specifier') {
              const nameNode = specifier.childForFieldName('name') || specifier.children[0];
              if (nameNode) {
                importedSymbols.push(nameNode.text);
              }
            }
          }
        }
      }
    }

    const { isConditional, enclosingBlockType, leavesBlockEmpty } =
      !isTopLevel ? this.analyzeNestingContext(node, preserveAllowlist) : { isConditional: false, leavesBlockEmpty: false };

    return {
      text,
      range: { start: startPos, end: endPos },
      scope,
      isConditional,
      moduleName,
      importedSymbols,
      isFromImport: true,
      indentation,
      enclosingBlockType,
      leavesBlockEmpty
    };
  }

  private extractRequireImport(
    node: Parser.SyntaxNode,
    sourceText: string,
    lines: string[],
    preserveAllowlist: string[]
  ): FoundImport | null {
    // Look for require('module') in declarator
    const declarator = node.descendantsOfType('variable_declarator')[0];
    if (!declarator) {
      return null;
    }

    const value = declarator.childForFieldName('value');
    if (!value || value.type !== 'call_expression') {
      return null;
    }

    const fn = value.childForFieldName('function');
    if (!fn || fn.text !== 'require') {
      return null;
    }

    const args = value.childForFieldName('arguments');
    if (!args || args.childCount === 0) {
      return null;
    }

    const moduleArg = args.children.find(c => c.type === 'string');
    if (!moduleArg) {
      return null;
    }

    const moduleName = moduleArg.text.replace(/['"`]/g, '');
    const isTopLevel = node.parent?.type === 'program';
    const scope = isTopLevel ? 'top' : 'nested';

    const startPos: SourcePosition = {
      line: node.startPosition.row,
      character: node.startPosition.column
    };
    const endPos: SourcePosition = {
      line: node.endPosition.row,
      character: node.endPosition.column
    };

    const text = sourceText.substring(node.startIndex, node.endIndex);
    const lineText = lines[node.startPosition.row] || '';
    const indentation = lineText.match(/^\s*/)?.[0] || '';

    const { isConditional, enclosingBlockType, leavesBlockEmpty } =
      !isTopLevel ? this.analyzeNestingContext(node, preserveAllowlist) : { isConditional: false, leavesBlockEmpty: false };

    return {
      text,
      range: { start: startPos, end: endPos },
      scope,
      isConditional,
      moduleName,
      indentation,
      enclosingBlockType,
      leavesBlockEmpty
    };
  }

  private analyzeNestingContext(
    node: Parser.SyntaxNode,
    preserveAllowlist: string[]
  ): { isConditional: boolean; enclosingBlockType?: string; leavesBlockEmpty: boolean } {
    let current: Parser.SyntaxNode | null = node.parent;
    let isConditional = false;
    let enclosingBlockType: string | undefined;
    let leavesBlockEmpty = false;

    if (current && current.type === 'statement_block') {
      enclosingBlockType = current.parent?.type;
      const statements = current.children.filter(c => {
        return c.type !== '{' && c.type !== '}' && c.type !== 'comment' && c.type !== ';';
      });
      if (statements.length <= 1) {
        leavesBlockEmpty = true;
      }
    }

    while (current && current.type !== 'program') {
      if (current.type === 'if_statement') {
        enclosingBlockType = enclosingBlockType || 'if_statement';
        const condition = current.childForFieldName('condition');
        if (condition) {
          const condText = condition.text;
          if (
            condText.includes('typeof window') ||
            condText.includes('process.env') ||
            preserveAllowlist.some(k => condText.includes(k))
          ) {
            isConditional = true;
            break;
          }
        }
      } else if (current.type === 'try_statement') {
        enclosingBlockType = enclosingBlockType || 'try_statement';
        // In JS/TS, try/catch with require/import might be conditional fallback
        const catchClause = current.children.find(c => c.type === 'catch_clause');
        if (catchClause) {
          isConditional = true;
          break;
        }
      }

      current = current.parent;
    }

    return { isConditional, enclosingBlockType, leavesBlockEmpty };
  }

  getHeaderInsertionPoint(sourceText: string): InsertionPoint {
    const lines = sourceText.split(/\r?\n/);
    let insertLine = 0;
    let lastTopImportLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Shebang
      if (i === 0 && line.startsWith('#!')) {
        insertLine = i + 1;
        continue;
      }

      // Directives: "use strict"; "use client"; "use server";
      if (
        (trimmed === '"use strict";' || trimmed === "'use strict';" ||
         trimmed === '"use client";' || trimmed === "'use client';" ||
         trimmed === '"use server";' || trimmed === "'use server';") &&
        insertLine === i
      ) {
        insertLine = i + 1;
        continue;
      }

      // Leading comments
      if (
        (line.startsWith('//') || line.startsWith('/*') || line.startsWith(' *') || line.startsWith('*/')) &&
        lastTopImportLine === -1 &&
        insertLine === i
      ) {
        insertLine = i + 1;
        continue;
      }

      // Top-level imports or requires
      if (
        trimmed.startsWith('import ') ||
        (trimmed.startsWith('const ') && trimmed.includes("require(")) ||
        (trimmed.startsWith('let ') && trimmed.includes("require(")) ||
        (trimmed.startsWith('var ') && trimmed.includes("require("))
      ) {
        lastTopImportLine = i;
        insertLine = i + 1;
        continue;
      }

      // Blank lines inside top import block
      if (trimmed === '' && (lastTopImportLine === i - 1 || insertLine === i)) {
        let nextHasImport = false;
        for (let j = i + 1; j < lines.length; j++) {
          const nextTrimmed = lines[j].trim();
          if (nextTrimmed === '') {
            continue;
          }
          if (nextTrimmed.startsWith('import ') || nextTrimmed.includes("require(")) {
            nextHasImport = true;
          }
          break;
        }
        if (nextHasImport) {
          continue;
        }
      }

      if (trimmed !== '' && !line.startsWith('//') && !line.startsWith('/*')) {
        break;
      }
    }

    const prefixNewlines = (insertLine === 0 || lastTopImportLine !== -1) ? 0 : 1;
    const suffixNewlines = (insertLine < lines.length && lines[insertLine].trim() !== '') ? 1 : 0;

    return {
      position: { line: insertLine, character: 0 },
      prefixNewlines,
      suffixNewlines
    };
  }

  isDuplicate(existingImport: FoundImport, newImport: FoundImport): boolean {
    const normA = existingImport.text.replace(/\s+/g, ' ').replace(/;$/, '').trim();
    const normB = newImport.text.replace(/\s+/g, ' ').replace(/;$/, '').trim();
    return normA === normB;
  }

  categorizeImport(importStmt: FoundImport): ImportCategory {
    if (importStmt.moduleName.startsWith('.') || importStmt.moduleName.startsWith('/')) {
      return 'local';
    }
    if (NODE_BUILTINS.has(importStmt.moduleName)) {
      return 'stdlib';
    }
    return 'thirdParty';
  }
}
