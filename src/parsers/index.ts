import * as path from 'path';
import Parser from 'web-tree-sitter';
import { LanguageParser } from './LanguageParser';
import { PythonParser } from './PythonParser';
import { TypeScriptParser } from './TypeScriptParser';
import { RegexFallbackParser } from './RegexFallbackParser';

export class ParserRegistry {
  private static instance: ParserRegistry | null = null;
  private parsers: Map<string, LanguageParser> = new Map();
  private fallbackParser: LanguageParser = new RegexFallbackParser();
  private wasmDirectory: string = '';
  private isTreeSitterInitialized = false;

  private constructor() {
    this.registerParser(new PythonParser());
    this.registerParser(new TypeScriptParser());
  }

  static getInstance(): ParserRegistry {
    if (!ParserRegistry.instance) {
      ParserRegistry.instance = new ParserRegistry();
    }
    return ParserRegistry.instance;
  }

  async init(wasmDirectory: string): Promise<void> {
    this.wasmDirectory = wasmDirectory;

    if (!this.isTreeSitterInitialized) {
      const treeSitterWasmPath = path.join(wasmDirectory, 'tree-sitter.wasm');
      await Parser.init({
        locateFile(scriptName: string) {
          if (scriptName === 'tree-sitter.wasm') {
            return treeSitterWasmPath;
          }
          return path.join(wasmDirectory, scriptName);
        }
      });
      this.isTreeSitterInitialized = true;
    }
  }

  registerParser(parser: LanguageParser): void {
    for (const langId of parser.languageIds) {
      this.parsers.set(langId.toLowerCase(), parser);
    }
  }

  async getParser(languageId: string): Promise<LanguageParser> {
    const parser = this.parsers.get(languageId.toLowerCase());
    if (parser) {
      if (!parser.isInitialized() && this.wasmDirectory) {
        await parser.init(this.wasmDirectory);
      }
      return parser;
    }
    return this.fallbackParser;
  }

  isSupported(languageId: string): boolean {
    return this.parsers.has(languageId.toLowerCase());
  }
}

export * from './LanguageParser';
export * from './PythonParser';
export * from './TypeScriptParser';
export * from './RegexFallbackParser';
