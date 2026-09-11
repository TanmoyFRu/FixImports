# Fix Imports

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue.svg)](https://marketplace.visualstudio.com/items?itemName=antigravity.fix-imports)
[![Open VSX](https://img.shields.io/badge/Open%20VSX-Registry-purple.svg)](https://open-vsx.org/extension/antigravity/fix-imports)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Fix Imports is a Visual Studio Code extension that detects import statements placed outside the top header block (such as inside function bodies, loops, or try/except blocks) and moves them up to the top of the file alongside other imports.

Detection is AST-based via `web-tree-sitter` (WebAssembly), running natively within the extension host without external subprocesses or regex fragility.

---

## Features

- **AST-Based Detection**: Uses WebAssembly tree-sitter grammars to parse syntax trees accurately rather than relying on regex approximations.
- **Conditional Import Preservation**: Automatically preserves intentional fallback patterns, such as:
  ```python
  try:
      import ujson as json
  except (ImportError, ModuleNotFoundError):
      import json
  ```
  Also preserves typing guards (`if TYPE_CHECKING:`) and version/platform checks (`if sys.version_info >= (3, 10):`).
- **Python Syntax Safety**: When removing a nested import leaves an indented Python block (`try`, `except`, `if`, `def`) empty, the extension automatically inserts an indented `pass` statement to prevent `IndentationError`.
- **Header Insertion Rules**:
  - **Python**: Respects shebang lines (`#!/...`), encoding declarations, module docstrings (`"""..."""`), and ensures `from __future__ import ...` statements always remain at the very top.
  - **JavaScript / TypeScript**: Respects shebangs, license headers, and directives (`"use client";`, `"use server";`, `"use strict";`).
- **Extensible Architecture**: Language support is decoupled through a modular `LanguageParser` interface and central parser registry.
- **Selection and Whole-File Scope**: Run on selected code blocks or execute across the entire document.
- **Diagnostics and Quick Fixes**: Provides optional warning squiggles and inline Quick Fix actions (`Cmd+.` / `Ctrl+.`).
- **Configurable Sorting and Grouping**: Optionally sort moved imports alphabetically and group them by origin (standard library, third-party, local).

---

## Usage

### Context Menu
Select a block of code (or right-click anywhere in the editor) and select **Fix Imports**.

### Keyboard Shortcut
- **Linux / Windows**: `Ctrl+Alt+I`
- **macOS**: `Cmd+Alt+I`

### Command Palette
Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and choose:
- `Fix Imports: Fix Imports` (operates on the active selection or the entire file if nothing is selected)
- `Fix Imports: Fix All Imports in File`

### Quick Fix (Code Action)
When diagnostics are enabled, hover over any highlighted misplaced import and click the lightbulb icon or press `Cmd+.` / `Ctrl+.`:
- **Fix Import: Move to top of file**
- **Fix all misplaced imports in file**

---

## Configuration

The extension can be configured via VS Code settings (`settings.json`):

```jsonc
{
  // Module names, symbols, or condition keywords that indicate intentional conditional imports to preserve
  "fixImports.preserveConditionalImports": [
    "typing",
    "TYPE_CHECKING",
    "sys.version_info",
    "sys.platform"
  ],

  // Automatically sort moved imports alphabetically at the top header
  "fixImports.sortImportsAfterMove": true,

  // Group imports by origin (stdlib, third-party, local) when inserting at the top
  "fixImports.groupByOrigin": true,

  // Display warning squiggles and quick fixes on misplaced imports
  "fixImports.enableDiagnostics": true,

  // Insert 'pass' in Python blocks that would otherwise become empty after moving imports
  "fixImports.python.insertPassOnEmptyBlock": true
}
```

---

## Supported Languages

| Language | AST Parser | Capabilities |
|---|---|---|
| **Python** (`.py`) | `tree-sitter-python.wasm` | Full AST parsing, deliberate conditional import detection, automatic `pass` insertion |
| **TypeScript** (`.ts`, `.tsx`) | `tree-sitter-typescript.wasm` | ES imports, CommonJS `require()` declarations, directive preservation |
| **JavaScript** (`.js`, `.jsx`) | `tree-sitter-typescript.wasm` | ES imports, CommonJS `require()` declarations, directive preservation |
| **Other Languages** | `RegexFallbackParser` | Line-by-line regex fallback when no registered grammar exists |

---

## Architecture

```
fix-imports/
├── src/
│   ├── extension.ts              # Activation, commands, CodeActions, and Diagnostics
│   ├── core/
│   │   ├── ImportFixer.ts        # Orchestrator — calls language parser & applies edits
│   │   ├── EditPlanner.ts        # Computes minimal TextEdits, pass insertion & sorting
│   │   └── types.ts              # Core interfaces (FoundImport, InsertionPoint, Config)
│   ├── parsers/
│   │   ├── LanguageParser.ts     # Common interface for all language parsers
│   │   ├── PythonParser.ts       # Tree-sitter Python AST parser
│   │   ├── TypeScriptParser.ts   # Tree-sitter JS/TS AST parser
│   │   ├── RegexFallbackParser.ts# Fallback parser for unregistered file types
│   │   └── index.ts              # Central parser registry & WASM manager
│   ├── config/
│   │   └── settings.ts           # Settings reader with defaults
│   └── ui/
│       ├── CodeActions.ts        # CodeActionProvider for inline Quick Fixes
│       └── Diagnostics.ts       # DiagnosticCollection with debounced reporting
├── dist/
│   ├── extension.js              # Bundled extension code
│   └── wasm/                     # Tree-sitter WebAssembly binaries
├── test/                         # Test suites (Python, TypeScript, EditPlanner, fixtures)
└── .github/workflows/            # CI testing and dual marketplace release workflows
```

---

## Development

### Setup
```bash
npm install
```

### Build
Bundles the extension using `esbuild` and copies the WebAssembly grammar binaries to `dist/wasm/`:
```bash
npm run build
```

### Test
Executes unit and integration test suites:
```bash
npm test
```

### Package (.vsix)
Generates the `.vsix` distribution bundle:
```bash
npm run package
```

### Publishing
Automated via `.github/workflows/publish.yml` upon pushing a version tag (e.g. `v0.1.0`), or manually via:
```bash
npm run publish:marketplace
npm run publish:openvsx
```

---

## License

MIT (c) Tanmoy Debnath
