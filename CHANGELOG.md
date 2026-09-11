# Changelog

All notable changes to the "fix-imports" extension will be documented in this file.

## [0.1.0] - 2026-09-11

### Added
- Initial release of **Fix Imports**.
- AST-based parsing powered by `web-tree-sitter` WebAssembly (runs natively with zero subprocesses).
- Extensible plug-in architecture for language parsers.
- **Python Parser**:
  - Detects imports nested in functions, loops, and `try/except` blocks.
  - Distinguishes deliberate conditional imports (e.g. `try: import ujson / except ImportError:` and `if TYPE_CHECKING:`).
  - Preserves module docstrings, shebangs, encoding cookies, and `from __future__ import ...` statements.
  - Automatically inserts indented `pass` when removing an import would otherwise leave an empty block.
- **TypeScript / JavaScript Parser**:
  - Detects misplaced ES `import` and CommonJS `require()` declarations.
  - Honors directives (`"use strict"`, `"use client"`, `"use server"`) and license headers.
- **Regex Fallback Parser**:
  - Graceful fallback for unregistered languages.
- **Selection & Whole-File Modes**:
  - Trigger via right-click editor context menu ("Fix Imports"), keybinding (`Ctrl+Alt+I` / `Cmd+Alt+I`), or command palette.
- **Real-Time Diagnostics & Quick Fixes**:
  - Subtle warning squiggles for misplaced imports.
  - Inline Quick Fix code actions (`Fix Import: Move to top of file`, `Fix all misplaced imports in file`).
- **Configuration**:
  - Customizable allowlist for deliberate imports (`fixImports.preserveConditionalImports`).
  - Automatic sorting (`fixImports.sortImportsAfterMove`).
  - Intelligent grouping by origin (`fixImports.groupByOrigin`).
  - Python empty block safety (`fixImports.python.insertPassOnEmptyBlock`).
- CI/CD workflow for automated dual publishing to VS Code Marketplace and Open VSX.
