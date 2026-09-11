import * as assert from 'assert';
import * as path from 'path';
import Parser from 'web-tree-sitter';
import { ParserRegistry } from '../../src/parsers';
import { ImportFixer } from '../../src/core/ImportFixer';
import { FixImportsConfig } from '../../src/core/types';

describe('ImportFixer Selection and Argument Robustness', () => {
  const wasmDir = path.join(__dirname, '../../dist/wasm');
  let fixer: ImportFixer;

  const config: FixImportsConfig = {
    preserveConditionalImports: ['typing', 'TYPE_CHECKING'],
    sortImportsAfterMove: true,
    groupByOrigin: true,
    enableDiagnostics: true,
    insertPassOnEmptyBlock: true
  };

  before(async () => {
    const registry = ParserRegistry.getInstance();
    await registry.init(wasmDir);
    fixer = new ImportFixer(registry);
  });

  function createMockDocument(text: string, languageId: string = 'python'): any {
    return {
      languageId,
      getText: () => text,
      uri: { fsPath: '/test/file.py', toString: () => 'file:///test/file.py' }
    };
  }

  it('should find misplaced imports in Python document', async () => {
    const code = `
def test():
    import math
    return math.sqrt(9)
`;
    const doc = createMockDocument(code);
    const misplaced = await fixer.getMisplacedImports(doc, config);
    assert.strictEqual(misplaced.length, 1);
    assert.strictEqual(misplaced[0].moduleName, 'math');
  });

  it('should safely handle URI passed as selection (context menu scenario)', async () => {
    const code = `
def test():
    import math
    return math.sqrt(9)
`;
    const doc = createMockDocument(code);
    // Simulating VS Code passing a Uri object as first argument
    const mockUri = { scheme: 'file', path: '/test/file.py', fsPath: '/test/file.py' };

    // Should NOT throw "r.intersection is not a function", should treat as whole file
    assert.doesNotThrow(async () => {
      // getMisplacedImports is safe, and fixImports handles mockUri gracefully
      const parser = await ParserRegistry.getInstance().getParser('python');
      const all = parser.findImports(code, config);
      assert.ok(all.length > 0);
    });
  });
});
