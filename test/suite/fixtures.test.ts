import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import Parser from 'web-tree-sitter';
import { PythonParser } from '../../src/parsers/PythonParser';
import { TypeScriptParser } from '../../src/parsers/TypeScriptParser';
import { EditPlanner } from '../../src/core/EditPlanner';
import { FixImportsConfig } from '../../src/core/types';

describe('End-to-End Examples Simulation', () => {
  const pyParser = new PythonParser();
  const tsParser = new TypeScriptParser();
  const wasmDir = path.join(__dirname, '../../dist/wasm');

  const config: FixImportsConfig = {
    preserveConditionalImports: ['typing', 'TYPE_CHECKING', 'sys.version_info', 'sys.platform'],
    sortImportsAfterMove: true,
    groupByOrigin: true,
    enableDiagnostics: true,
    insertPassOnEmptyBlock: true
  };

  before(async () => {
    await Parser.init({
      locateFile(scriptName: string) {
        return path.join(wasmDir, scriptName);
      }
    });
    await pyParser.init(wasmDir);
    await tsParser.init(wasmDir);
  });

  it('correctly processes python_example.py', () => {
    const pyPath = path.join(__dirname, '../../examples/python_example.py');
    const sourceText = fs.readFileSync(pyPath, 'utf8');

    const allImports = pyParser.findImports(sourceText, config);
    const toMove = allImports.filter(i => i.scope === 'nested' && !i.isConditional);

    // Only math and requests should be moved!
    assert.strictEqual(toMove.length, 2);
    assert.deepStrictEqual(
      toMove.map(i => i.moduleName).sort(),
      ['math', 'requests']
    );

    // Ensure ujson, json, and Decimal are preserved
    const conditionalImports = allImports.filter(i => i.isConditional);
    assert.ok(conditionalImports.some(i => i.text.includes('ujson')));
    assert.ok(conditionalImports.some(i => i.text.includes('Decimal')));

    // Plan edits
    const insertionPoint = pyParser.getHeaderInsertionPoint(sourceText);
    const edits = EditPlanner.planEdits(
      sourceText,
      allImports,
      toMove,
      insertionPoint,
      config,
      pyParser
    );

    // Verify pass insertion for requests try block
    const passEdit = edits.find(e => e.newText.includes('pass'));
    assert.ok(passEdit, 'Expected pass statement in place of removed requests import');

    // Verify header insertion contains math and requests
    const insertEdit = edits.find(e => e.range.start.line === insertionPoint.position.line && e.newText.includes('import'));
    assert.ok(insertEdit);
    assert.ok(insertEdit.newText.includes('import math'));
    assert.ok(insertEdit.newText.includes('import requests'));
  });

  it('correctly processes typescript_example.ts', () => {
    const tsPath = path.join(__dirname, '../../examples/typescript_example.ts');
    const sourceText = fs.readFileSync(tsPath, 'utf8');

    const allImports = tsParser.findImports(sourceText, config);
    const toMove = allImports.filter(i => i.scope === 'nested' && !i.isConditional);

    // formatCurrency and path should be moved
    assert.strictEqual(toMove.length, 2);

    // analytics conditional require should NOT be moved
    const analytics = allImports.find(i => i.text.includes('analytics'));
    assert.ok(analytics);
    assert.strictEqual(analytics.isConditional, true);

    const insertionPoint = tsParser.getHeaderInsertionPoint(sourceText);
    // Insertion point should be after "use client" directive
    assert.ok(insertionPoint.position.line >= 2);
  });
});
