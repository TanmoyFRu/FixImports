import * as assert from 'assert';
import * as path from 'path';
import Parser from 'web-tree-sitter';
import { TypeScriptParser } from '../../src/parsers/TypeScriptParser';

describe('TypeScriptParser', () => {
  const parser = new TypeScriptParser();
  const wasmDir = path.join(__dirname, '../../dist/wasm');

  before(async () => {
    await Parser.init({
      locateFile(scriptName: string) {
        return path.join(wasmDir, scriptName);
      }
    });
    await parser.init(wasmDir);
  });

  it('should detect top-level ES imports', () => {
    const code = `import React from 'react';\nimport { useState } from 'react';\n`;
    const imports = parser.findImports(code);

    assert.strictEqual(imports.length, 2);
    assert.ok(imports.every(i => i.scope === 'top'));
  });

  it('should detect misplaced imports inside functions', () => {
    const code = `
function render() {
    import { helper } from './helper';
    return helper();
}
`;
    const imports = parser.findImports(code);

    assert.strictEqual(imports.length, 1);
    assert.strictEqual(imports[0].scope, 'nested');
    assert.strictEqual(imports[0].isConditional, false);
    assert.strictEqual(imports[0].moduleName, './helper');
  });

  it('should detect misplaced require calls inside functions', () => {
    const code = `
function loadConfig() {
    const fs = require('fs');
    return fs.readFileSync('config.json');
}
`;
    const imports = parser.findImports(code);

    assert.strictEqual(imports.length, 1);
    assert.strictEqual(imports[0].scope, 'nested');
    assert.strictEqual(imports[0].moduleName, 'fs');
  });

  it('should detect header insertion point after directives like "use client"', () => {
    const code = `#!/usr/bin/env node
"use client";
import React from 'react';

export function Component() {}
`;
    const insertion = parser.getHeaderInsertionPoint(code);
    assert.strictEqual(insertion.position.line, 3);
  });

  it('should categorize Node built-ins vs third-party vs local imports', () => {
    const impBuiltin = { moduleName: 'fs', text: "const fs = require('fs');" } as any;
    const impThirdParty = { moduleName: 'lodash', text: "import _ from 'lodash';" } as any;
    const impLocal = { moduleName: './components/Button', text: "import Button from './components/Button';" } as any;

    assert.strictEqual(parser.categorizeImport(impBuiltin), 'stdlib');
    assert.strictEqual(parser.categorizeImport(impThirdParty), 'thirdParty');
    assert.strictEqual(parser.categorizeImport(impLocal), 'local');
  });
});
