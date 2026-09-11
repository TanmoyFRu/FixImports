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

// Comprehensive set of Python standard library modules
const PYTHON_STDLIB = new Set([
  '__future__', '_thread', 'abc', 'aifc', 'argparse', 'array', 'ast', 'asynchat', 'asyncio',
  'asyncore', 'atexit', 'audioop', 'base64', 'bdb', 'binascii', 'binhex', 'bisect',
  'builtins', 'bz2', 'cProfile', 'calendar', 'cgi', 'cgitb', 'chunk', 'cmath',
  'cmd', 'code', 'codecs', 'codeop', 'collections', 'colorsys', 'compileall',
  'concurrent', 'configparser', 'contextlib', 'contextvars', 'copy', 'copyreg',
  'crypt', 'csv', 'ctypes', 'curses', 'dataclasses', 'datetime', 'dbm', 'decimal',
  'difflib', 'dis', 'distutils', 'doctest', 'dummy_threading', 'email', 'encodings',
  'enum', 'errno', 'faulthandler', 'fcntl', 'filecmp', 'fileinput', 'fnmatch',
  'formatter', 'fractions', 'ftplib', 'functools', 'gc', 'getopt', 'getpass',
  'gettext', 'glob', 'grp', 'gzip', 'hashlib', 'heapq', 'hmac', 'html', 'http',
  'imaplib', 'imghdr', 'imp', 'importlib', 'inspect', 'io', 'ipaddress', 'itertools',
  'json', 'keyword', 'linecache', 'locale', 'logging', 'lzma', 'mailbox', 'mailcap',
  'marshal', 'math', 'mimetypes', 'mmap', 'modulefinder', 'msilib', 'msvcrt',
  'multiprocessing', 'netrc', 'nis', 'nntplib', 'numbers', 'operator', 'optparse',
  'os', 'ossaudiodev', 'parser', 'pathlib', 'pdb', 'pickle', 'pickletools',
  'pipes', 'pkgutil', 'platform', 'plistlib', 'poplib', 'posix', 'posixpath',
  'pprint', 'profile', 'pstats', 'pty', 'pwd', 'py_compile', 'pyclbr', 'pydoc',
  'queue', 'quopri', 'random', 're', 'readline', 'reprlib', 'resource', 'rlcompleter',
  'runpy', 'sched', 'secrets', 'select', 'selectors', 'shelve', 'shlex', 'shutil',
  'signal', 'site', 'smtpd', 'smtplib', 'sndhdr', 'socket', 'socketserver',
  'spwd', 'sqlite3', 'ssl', 'stat', 'statistics', 'string', 'stringprep',
  'struct', 'subprocess', 'sunau', 'symbol', 'symtable', 'sys', 'sysconfig',
  'syslog', 'tabnanny', 'tarfile', 'telnetlib', 'tempfile', 'termios', 'test',
  'textwrap', 'threading', 'time', 'timeit', 'tkinter', 'token', 'tokenize',
  'tomllib', 'trace', 'traceback', 'tracemalloc', 'tty', 'turtle', 'turtledemo',
  'types', 'typing', 'unicodedata', 'unittest', 'urllib', 'uu', 'uuid', 'venv',
  'warnings', 'wave', 'weakref', 'webbrowser', 'winreg', 'winsound', 'wsgiref',
  'xdrlib', 'xml', 'xmlrpc', 'zipapp', 'zipfile', 'zipimport', 'zlib', 'zoneinfo'
]);

export class PythonParser implements LanguageParser {
  readonly languageIds = ['python'] as const;
  private parser: Parser | null = null;
  private isLoaded = false;

  async init(wasmDirectory: string): Promise<void> {
    if (this.isLoaded) {
      return;
    }
    const wasmPath = path.join(wasmDirectory, 'tree-sitter-python.wasm');
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
      throw new Error('PythonParser is not initialized. Call init() first.');
    }

    const tree = this.parser.parse(sourceText);
    const results: FoundImport[] = [];
    const preserveAllowlist = config?.preserveConditionalImports || [
      'typing',
      'TYPE_CHECKING',
      'sys.version_info',
      'sys.platform'
    ];

    const lines = sourceText.split(/\r?\n/);

    const visit = (node: Parser.SyntaxNode) => {
      const isImport =
        node.type === 'import_statement' ||
        node.type === 'import_from_statement' ||
        node.type === 'future_import_statement';

      if (isImport) {
        const importInfo = this.extractImportInfo(node, sourceText, lines, preserveAllowlist);
        if (importInfo) {
          results.push(importInfo);
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

  private extractImportInfo(
    node: Parser.SyntaxNode,
    sourceText: string,
    lines: string[],
    preserveAllowlist: string[]
  ): FoundImport | null {
    const isTopLevel = node.parent?.type === 'module';
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

    let moduleName = '';
    const importedSymbols: string[] = [];
    let isFromImport = false;

    if (node.type === 'future_import_statement') {
      moduleName = '__future__';
      isFromImport = true;
    } else if (node.type === 'import_statement') {
      // e.g. import os, sys
      // or import numpy as np
      const dottedName = node.descendantsOfType('dotted_name')[0];
      if (dottedName) {
        moduleName = dottedName.text.split('.')[0];
      }
    } else if (node.type === 'import_from_statement') {
      isFromImport = true;
      // from <module_name> import <symbols>
      // or from . import helper
      const moduleNode = node.childForFieldName('module_name') || node.children.find(c => c.type === 'dotted_name' || c.type === 'relative_import');
      if (moduleNode) {
        moduleName = moduleNode.text.split('.')[0] || moduleNode.text;
      }

      // Find imported symbols
      for (const child of node.children) {
        if (child.type === 'dotted_name' && child !== moduleNode) {
          importedSymbols.push(child.text);
        } else if (child.type === 'aliased_import') {
          const original = child.children[0];
          if (original) {
            importedSymbols.push(original.text);
          }
        }
      }
    }

    let isConditional = false;
    let enclosingBlockType: string | undefined;
    let leavesBlockEmpty = false;

    if (!isTopLevel) {
      const context = this.analyzeNestingContext(node, preserveAllowlist);
      isConditional = context.isConditional;
      enclosingBlockType = context.enclosingBlockType;
      leavesBlockEmpty = context.leavesBlockEmpty;
    }

    // Check allowlist against module name and symbols
    if (!isConditional && preserveAllowlist.length > 0) {
      if (preserveAllowlist.some(item => moduleName === item || text.includes(item))) {
        isConditional = true;
      }
    }

    return {
      text,
      range: { start: startPos, end: endPos },
      scope,
      isConditional,
      moduleName,
      importedSymbols,
      isFromImport,
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

    // Check if the immediate block only contains this statement
    if (current && current.type === 'block') {
      enclosingBlockType = current.parent?.type;

      // Count non-comment statement children in this block
      const statementChildren = current.children.filter(child => {
        return (
          child.type !== 'comment' &&
          child.type !== '\n' &&
          child.type !== ';'
        );
      });

      if (statementChildren.length <= 1) {
        leavesBlockEmpty = true;
      }
    }

    // Walk up the tree to check for conditional structures
    while (current && current.type !== 'module') {
      if (current.type === 'try_statement') {
        enclosingBlockType = enclosingBlockType || 'try_statement';
        // Inspect all except clauses of this try statement
        const isFallbackTry = this.isTryImportFallback(current);
        if (isFallbackTry) {
          isConditional = true;
          break;
        }
      } else if (current.type === 'if_statement') {
        enclosingBlockType = enclosingBlockType || 'if_statement';
        if (this.isConditionalIfStatement(current, preserveAllowlist)) {
          isConditional = true;
          break;
        }
      } else if (
        current.type === 'function_definition' ||
        current.type === 'class_definition' ||
        current.type === 'while_statement' ||
        current.type === 'for_statement'
      ) {
        enclosingBlockType = enclosingBlockType || current.type;
      }

      current = current.parent;
    }

    return { isConditional, enclosingBlockType, leavesBlockEmpty };
  }

  /**
   * Checks if a try/except statement is a deliberate import fallback:
   * e.g.:
   *   try:
   *       import ujson as json
   *   except ImportError:
   *       import json
   */
  private isTryImportFallback(tryNode: Parser.SyntaxNode): boolean {
    for (let i = 0; i < tryNode.childCount; i++) {
      const child = tryNode.child(i);
      if (child && child.type === 'except_clause') {
        const clauseText = child.text;
        // Check for ImportError or ModuleNotFoundError in the except clause header
        if (
          clauseText.includes('ImportError') ||
          clauseText.includes('ModuleNotFoundError')
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Checks if an if statement is checking TYPE_CHECKING or version/platform
   */
  private isConditionalIfStatement(
    ifNode: Parser.SyntaxNode,
    preserveAllowlist: string[]
  ): boolean {
    const conditionNode = ifNode.childForFieldName('condition');
    if (!conditionNode) {
      return false;
    }

    const condText = conditionNode.text;
    const conditionalKeywords = [
      'TYPE_CHECKING',
      'sys.version_info',
      'sys.platform',
      ...preserveAllowlist
    ];

    return conditionalKeywords.some(keyword => condText.includes(keyword));
  }

  getHeaderInsertionPoint(sourceText: string): InsertionPoint {
    const lines = sourceText.split(/\r?\n/);
    let insertLine = 0;
    let inDocstring = false;
    let docstringDelimiter = '';
    let foundShebangOrEncoding = false;
    let foundFutureImport = false;
    let lastTopImportLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Check multiline docstring at top
      if (!inDocstring) {
        if (
          (trimmed.startsWith('"""') || trimmed.startsWith("'''")) &&
          insertLine === i
        ) {
          const delim = trimmed.substring(0, 3);
          // Check if docstring ends on same line
          if (trimmed.length > 3 && trimmed.endsWith(delim) && !trimmed.slice(3, -3).includes(delim)) {
            insertLine = i + 1;
            continue;
          } else {
            inDocstring = true;
            docstringDelimiter = delim;
            insertLine = i + 1;
            continue;
          }
        }
      } else {
        insertLine = i + 1;
        if (trimmed.endsWith(docstringDelimiter) || trimmed.includes(docstringDelimiter)) {
          inDocstring = false;
        }
        continue;
      }

      // Shebang line
      if (i === 0 && line.startsWith('#!')) {
        foundShebangOrEncoding = true;
        insertLine = i + 1;
        continue;
      }

      // Coding cookie: # -*- coding: utf-8 -*-
      if ((i === 0 || i === 1) && line.includes('coding') && line.startsWith('#')) {
        foundShebangOrEncoding = true;
        insertLine = i + 1;
        continue;
      }

      // Leading comments before code
      if (line.startsWith('#') && lastTopImportLine === -1 && insertLine === i) {
        insertLine = i + 1;
        continue;
      }

      // Future imports must stay at top
      if (line.startsWith('from __future__ import')) {
        foundFutureImport = true;
        insertLine = i + 1;
        lastTopImportLine = i;
        continue;
      }

      // Top level imports: track the end of consecutive top level import block
      if (line.startsWith('import ') || line.startsWith('from ')) {
        lastTopImportLine = i;
        insertLine = i + 1;
        continue;
      }

      // If blank line inside top header / import block
      if (trimmed === '' && (lastTopImportLine === i - 1 || insertLine === i)) {
        // Keep scanning to see if more top imports follow
        let nextHasImport = false;
        for (let j = i + 1; j < lines.length; j++) {
          const nextTrimmed = lines[j].trim();
          if (nextTrimmed === '') {
            continue;
          }
          if (nextTrimmed.startsWith('import ') || nextTrimmed.startsWith('from ')) {
            nextHasImport = true;
          }
          break;
        }
        if (nextHasImport) {
          continue;
        }
      }

      // First non-import, non-docstring code line reached
      if (trimmed !== '' && !line.startsWith('#')) {
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
    const normA = existingImport.text.replace(/\s+/g, ' ').trim();
    const normB = newImport.text.replace(/\s+/g, ' ').trim();
    return normA === normB;
  }

  categorizeImport(importStmt: FoundImport): ImportCategory {
    if (importStmt.moduleName === '__future__' || importStmt.text.includes('__future__')) {
      return 'future';
    }
    if (importStmt.text.startsWith('from .') || importStmt.moduleName.startsWith('.')) {
      return 'local';
    }
    if (PYTHON_STDLIB.has(importStmt.moduleName)) {
      return 'stdlib';
    }
    return 'thirdParty';
  }
}
