import * as assert from 'assert';
import * as path from 'path';
import Parser from 'web-tree-sitter';
import { PythonParser } from '../../src/parsers/PythonParser';
import { EditPlanner } from '../../src/core/EditPlanner';
import { FixImportsConfig, FoundImport } from '../../src/core/types';

describe('EditPlanner', () => {
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

  const defaultConfig: FixImportsConfig = {
    preserveConditionalImports: ['typing', 'TYPE_CHECKING'],
    sortImportsAfterMove: true,
    groupByOrigin: true,
    enableDiagnostics: true,
    insertPassOnEmptyBlock: true
  };

  it('should plan edits that delete nested import and insert at header', () => {
    const code = `import os

def foo():
    import math
    return math.sqrt(4)
`;
    const allImports = parser.findImports(code);
    const toMove = allImports.filter(i => i.scope === 'nested' && !i.isConditional);
    const insertionPoint = parser.getHeaderInsertionPoint(code);

    const edits = EditPlanner.planEdits(
      code,
      allImports,
      toMove,
      insertionPoint,
      defaultConfig,
      parser
    );

    assert.strictEqual(edits.length, 2); // 1 deletion + 1 insertion
    const insertionEdit = edits.find(e => e.newText.includes('import math'));
    assert.ok(insertionEdit);
    assert.strictEqual(insertionEdit.range.start.line, 1);
  });

  it('should insert pass when removing sole statement from a block in Python', () => {
    const code = `
try:
    import requests
except Exception:
    pass
`;
    const allImports = parser.findImports(code);
    const toMove = allImports.filter(i => i.scope === 'nested' && !i.isConditional);
    const insertionPoint = parser.getHeaderInsertionPoint(code);

    const edits = EditPlanner.planEdits(
      code,
      allImports,
      toMove,
      insertionPoint,
      defaultConfig,
      parser
    );

    const passEdit = edits.find(e => e.newText.trim() === 'pass');
    assert.ok(passEdit, 'Expected an edit replacing empty block with pass');
  });

  it('should deduplicate imports if already present at top level', () => {
    const code = `import math

def foo():
    import math
    return 1
`;
    const allImports = parser.findImports(code);
    const toMove = allImports.filter(i => i.scope === 'nested' && !i.isConditional);
    const insertionPoint = parser.getHeaderInsertionPoint(code);

    const edits = EditPlanner.planEdits(
      code,
      allImports,
      toMove,
      insertionPoint,
      defaultConfig,
      parser
    );

    // Only the deletion edit should exist; insertion edit is omitted due to deduplication
    assert.strictEqual(edits.length, 1);
    assert.strictEqual(edits[0].newText, '');
  });

  it('should group imports by stdlib and thirdParty when enabled', () => {
    const code = `
def foo():
    import requests
    import os
`;
    const allImports = parser.findImports(code);
    const toMove = allImports.filter(i => i.scope === 'nested' && !i.isConditional);
    const insertionPoint = parser.getHeaderInsertionPoint(code);

    const edits = EditPlanner.planEdits(
      code,
      allImports,
      toMove,
      insertionPoint,
      defaultConfig,
      parser
    );

    const insertEdit = edits.find(e => e.newText.includes('import'));
    assert.ok(insertEdit);
    // stdlib ('import os') should come before thirdParty ('import requests')
    const osIdx = insertEdit.newText.indexOf('import os');
    const reqIdx = insertEdit.newText.indexOf('import requests');
    assert.ok(osIdx < reqIdx, 'stdlib imports should be grouped before thirdParty');
  });
});
