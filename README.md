# Fix Imports

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue.svg)](https://marketplace.visualstudio.com/items?itemName=antigravity.fix-imports)
[![Open VSX](https://img.shields.io/badge/Open%20VSX-Registry-purple.svg)](https://open-vsx.org/extension/antigravity/fix-imports)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Fix Imports is an AST-powered VS Code extension that detects and moves imports stranded inside functions, try/except blocks, and loops by AI coding assistants like GitHub Copilot, Cursor, and Claude cleanly up to the top header of your file.

---

## Why This Exists: The AI Agent Problem

If you use AI coding assistants (Copilot, Cursor, Claude, ChatGPT, Devin, or local LLMs), you have seen this pattern:

You prompt the AI to fix a specific function or implement a quick method. Because AI models operate on local diffs and token-limited context windows, they frequently take the path of least resistance: **they insert `import` statements directly inside the function body or inside a nested block**, rather than navigating to the top of your file.

```python
# What the AI agent leaves behind:

def process_transaction(payload):
    import json               # Injected by AI
    import requests           # Injected by AI
    
    try:
        data = json.loads(payload)
        import math           # Injected by AI inside a block
        return math.ceil(data["amount"])
    except Exception as e:
        logger.error(e)
```

This pollutes codebases with:
- Imports scattered across logical layers and functions.
- Redundant and duplicate imports already declared at the file header.
- Repeated performance hits in interpreted loops.
- Style violations that fail linters (PEP 8, ESLint, Flake8).

Manually fixing this requires scrolling to line 1, checking whether each import already exists, merging duplicates, maintaining order conventions, scrolling back down, deleting the old line, and ensuring the remaining block does not fail with an `IndentationError`.

**Fix Imports automates this entirely.** With one hotkey (`Ctrl+Alt+I` / `Cmd+Alt+I`) or right-click, it extracts rogue imports from your selection (or whole file), moves them to the top header, deduplicates against existing imports, sorts them, and leaves the remaining code syntactically valid.

---

## Before and After

### Python Example

#### Before (AI-Generated Snippet)
```python
#!/usr/bin/env python3
"""Main service runner."""
from __future__ import annotations
import os

def calculate_metric(data):
    import math
    return math.sqrt(data.value)

def send_notification(user_id, message):
    try:
        import requests
    except Exception:
        pass
```

#### After running Fix Imports (`Ctrl+Alt+I`)
```python
#!/usr/bin/env python3
"""Main service runner."""
from __future__ import annotations
import math
import os

import requests

def calculate_metric(data):
    return math.sqrt(data.value)

def send_notification(user_id, message):
    try:
        pass
    except Exception:
        pass
```
*Notice: `from __future__` remains at the top, imports are categorized into standard library and third-party, and the empty `try` block receives a `pass` statement to prevent an `IndentationError`.*

---

### TypeScript / JavaScript Example

#### Before (AI-Generated Snippet)
```typescript
"use client";

import React from 'react';

export function UserProfile({ id }: { id: string }) {
    import { formatCurrency } from './utils/format';
    const path = require('path');

    return <div>{formatCurrency(100)}</div>;
}
```

#### After running Fix Imports
```typescript
"use client";

import path from 'path';
import React from 'react';
import { formatCurrency } from './utils/format';

export function UserProfile({ id }: { id: string }) {
    return <div>{formatCurrency(100)}</div>;
}
```
*Notice: Directives like `"use client"` remain above the moved imports, while ES imports and CommonJS requires are hoisted cleanly.*

---

## Features

- **True AST Parsing (Zero Regex Fragility)**: Built on `web-tree-sitter` (WebAssembly). Parses the concrete syntax tree in-process with zero external command-line dependencies or Python/Node subshell requirements.
- **Distinguishes AI Mistakes from Intentional Fallbacks**:
  - AI agents often nest imports out of laziness. However, some nested imports are deliberate—such as compatibility fallbacks:
    ```python
    try:
        import ujson as json
    except (ImportError, ModuleNotFoundError):
        import json
    ```
    Fix Imports inspects exception types in AST `except` blocks. If an exception handles `ImportError` or `ModuleNotFoundError`, or is guarded by `if TYPE_CHECKING:`, it is recognized as intentional and **preserved in place**.
- **Syntax-Safe Code Deletions**: If moving an import leaves an indented Python block (`def`, `if`, `try`, `except`) with no remaining statements, the extension automatically injects an indented `pass` statement so your code continues to run without syntax errors.
- **Header Insertion Intelligence**:
  - **Python**: Honors shebangs (`#!/...`), encoding cookies, module docstrings (`"""..."""`), and keeps `from __future__ import ...` statements above all other code.
  - **JavaScript / TypeScript**: Honors shebangs, license headers, and directives (`"use client";`, `"use server";`, `"use strict";`).
- **Selection & File Scopes**: Highlight only the code block touched by the AI agent to fix just that block, or run across the entire file.
- **Deduplication and Grouping**: Skips imports that are already imported at the top level, groups by origin (standard library, third-party, local), and sorts alphabetically.
- **Inline Quick Fixes**: Highlights misplaced imports with subtle warnings and provides one-click Quick Fix options (`Cmd+.` / `Ctrl+.`).

---

## Usage

### 1. Right-Click Context Menu
Select the code block edited by the AI agent (or right-click anywhere in the file) and select **Fix Imports**.

### 2. Keyboard Shortcut
- **Linux / Windows**: `Ctrl+Alt+I`
- **macOS**: `Cmd+Alt+I`

### 3. Command Palette
Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):
- `Fix Imports: Fix Imports`: Fixes imports inside your current selection, or whole file if nothing is selected.
- `Fix Imports: Fix All Imports in File`: Fixes all misplaced imports across the active document.

### 4. Quick Fix (Code Action)
Hover over any yellow warning underline on an import statement and press `Cmd+.` or `Ctrl+.`:
- **Fix Import: Move to top of file**
- **Fix all misplaced imports in file**

---

## Configuration

Customizable via VS Code `settings.json`:

```jsonc
{
  // Keywords, modules, or symbols that identify intentional conditional imports to preserve
  "fixImports.preserveConditionalImports": [
    "typing",
    "TYPE_CHECKING",
    "sys.version_info",
    "sys.platform"
  ],

  // Automatically sort moved imports alphabetically
  "fixImports.sortImportsAfterMove": true,

  // Group imports by origin (stdlib, third-party, local)
  "fixImports.groupByOrigin": true,

  // Display warning squiggles and quick fixes on misplaced imports
  "fixImports.enableDiagnostics": true,

  // Automatically insert 'pass' in Python blocks that would otherwise become empty
  "fixImports.python.insertPassOnEmptyBlock": true
}
```

---

## Supported Languages

| Language | AST Parser | Supported Features |
|---|---|---|
| **Python** (`.py`) | `tree-sitter-python.wasm` | Full AST, deliberate fallback detection (`try/except ImportError`), `pass` injection, `__future__` preservation |
| **TypeScript** (`.ts`, `.tsx`) | `tree-sitter-typescript.wasm` | ES imports, CommonJS `require()`, directive preservation (`"use client"`, `"use server"`) |
| **JavaScript** (`.js`, `.jsx`) | `tree-sitter-typescript.wasm` | ES imports, CommonJS `require()`, directive preservation (`"use strict"`) |
| **Other Languages** | `RegexFallbackParser` | Line-by-line fallback when no AST grammar is registered |

---

## Architecture

Fix Imports is designed with a decoupled, extensible architecture. Adding support for a new language requires only implementing the `LanguageParser` interface:

```
fix-imports/
├── src/
│   ├── extension.ts              # Activation, commands, CodeActions, and Diagnostics
│   ├── core/
│   │   ├── ImportFixer.ts        # Orchestrator — coordinates parser and applies workspace edits
│   │   ├── EditPlanner.ts        # Computes TextEdits, indentation, dedupe, pass injection
│   │   └── types.ts              # Core interfaces (FoundImport, InsertionPoint, Config)
│   ├── parsers/
│   │   ├── LanguageParser.ts     # Common interface for all language parsers
│   │   ├── PythonParser.ts       # Web-tree-sitter Python parser
│   │   ├── TypeScriptParser.ts   # Web-tree-sitter JS/TS parser
│   │   ├── RegexFallbackParser.ts# Last-resort regex fallback
│   │   └── index.ts              # Central parser registry & WASM manager
│   ├── config/
│   │   └── settings.ts           # Type-safe configuration reader
│   └── ui/
│       ├── CodeActions.ts        # VS Code CodeActionProvider for inline Quick Fixes
│       └── Diagnostics.ts       # Real-time debounced diagnostics
├── dist/
│   ├── extension.js              # High-performance bundled extension artifact
│   └── wasm/                     # Tree-sitter WebAssembly grammar binaries
└── .github/workflows/            # Automated CI test and dual marketplace release workflows
```

---

## Development

```bash
# Install dependencies
npm install

# Build extension and bundle WASM binaries
npm run build

# Run unit and integration tests (23 tests across Python, TS, and EditPlanner)
npm test

# Package .vsix
npm run package
```

---

## License

MIT (c) Tanmoy Debnath
