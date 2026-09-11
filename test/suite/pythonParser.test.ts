import * as assert from 'assert';
import * as path from 'path';
import Parser from 'web-tree-sitter';
import { PythonParser } from '../../src/parsers/PythonParser';

describe('PythonParser', () => {
  const parser = new PythonParser();
  const wasmDir = path.join(__dirname, '../../dist/wasm');

  before(async () => {
    await Parser.init({
      locateFile(scriptName: string) {
        return path.join(wasmDir, scriptName);
      }
    });
    await parser.init(wasmDir);
  });

  it('should detect top-level imports correctly', () => {
    const code = `import os\nimport sys\nfrom math import sqrt\n`;
    const imports = parser.findImports(code);

    assert.strictEqual(imports.length, 3);
    assert.ok(imports.every(i => i.scope === 'top'));
    assert.ok(imports.every(i => !i.isConditional));
  });

  it('should detect misplaced imports inside functions', () => {
    const code = `
def calculate():
    import math
    return math.sqrt(16)
`;
    const imports = parser.findImports(code);

    assert.strictEqual(imports.length, 1);
    assert.strictEqual(imports[0].scope, 'nested');
    assert.strictEqual(imports[0].isConditional, false);
    assert.strictEqual(imports[0].moduleName, 'math');
    assert.strictEqual(imports[0].enclosingBlockType, 'function_definition');
  });

  it('should flag try-nested imports when except catches generic Exception', () => {
    const code = `
try:
    do_something()
    import requests
except Exception:
    pass
`;
    const imports = parser.findImports(code);

    assert.strictEqual(imports.length, 1);
    assert.strictEqual(imports[0].scope, 'nested');
    assert.strictEqual(imports[0].isConditional, false);
    assert.strictEqual(imports[0].moduleName, 'requests');
  });

  it('should NOT flag deliberate conditional imports with ImportError fallback', () => {
    const code = `
try:
    import ujson as json
except ImportError:
    import json
`;
    const imports = parser.findImports(code);

    assert.strictEqual(imports.length, 2);
    assert.strictEqual(imports[0].scope, 'nested');
    assert.strictEqual(imports[0].isConditional, true);
    assert.strictEqual(imports[1].scope, 'nested');
    assert.strictEqual(imports[1].isConditional, true);
  });

  it('should NOT flag deliberate conditional imports with tuple (ImportError, ModuleNotFoundError)', () => {
    const code = `
try:
    import fast_module
except (ImportError, ModuleNotFoundError):
    import slow_module
`;
    const imports = parser.findImports(code);

    assert.strictEqual(imports.length, 2);
    assert.ok(imports.every(i => i.isConditional === true));
  });

  it('should NOT flag imports guarded by if TYPE_CHECKING', () => {
    const code = `
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from mypackage.models import HeavyModel
`;
    const imports = parser.findImports(code);

    const heavy = imports.find(i => i.text.includes('HeavyModel'));
    assert.ok(heavy);
    assert.strictEqual(heavy.scope, 'nested');
    assert.strictEqual(heavy.isConditional, true);
  });

  it('should correctly detect leavesBlockEmpty when import is sole statement', () => {
    const code = `
try:
    import requests
except Exception:
    pass
`;
    const imports = parser.findImports(code);
    assert.strictEqual(imports.length, 1);
    assert.strictEqual(imports[0].leavesBlockEmpty, true);
  });

  it('should identify header insertion point after shebang, docstrings, and __future__', () => {
    const code = `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Module docstring.
"""
from __future__ import annotations

def test():
    pass
`;
    const insertion = parser.getHeaderInsertionPoint(code);
    assert.strictEqual(insertion.position.line, 6);
  });

  it('should identify header insertion point after existing top-level imports', () => {
    const code = `import os
import sys

def test():
    pass
`;
    const insertion = parser.getHeaderInsertionPoint(code);
    assert.strictEqual(insertion.position.line, 2);
  });

  it('should correctly categorize standard library vs third-party vs local imports', () => {
    const impStdlib = { text: 'import os', moduleName: 'os' } as any;
    const impThirdParty = { text: 'import requests', moduleName: 'requests' } as any;
    const impLocal = { text: 'from .utils import helper', moduleName: '.' } as any;
    const impFuture = { text: 'from __future__ import annotations', moduleName: '__future__' } as any;

    assert.strictEqual(parser.categorizeImport(impFuture), 'future');
    assert.strictEqual(parser.categorizeImport(impStdlib), 'stdlib');
    assert.strictEqual(parser.categorizeImport(impThirdParty), 'thirdParty');
    assert.strictEqual(parser.categorizeImport(impLocal), 'local');
  });
});
