import * as assert from 'assert';
import { RegexFallbackParser } from '../../src/parsers/RegexFallbackParser';

describe('RegexFallbackParser', () => {
  const parser = new RegexFallbackParser();

  it('should detect imports in unregistered languages as fallback', () => {
    const code = `import foo\n\nfn main() {\n    import bar\n}\n`;
    const imports = parser.findImports(code);

    assert.strictEqual(imports.length, 2);
    assert.strictEqual(imports[0].scope, 'top');
    assert.strictEqual(imports[1].scope, 'nested');
  });

  it('should identify insertion point after comments', () => {
    const code = `// Header comment\n// Another comment\n\nfn main() {}\n`;
    const insertion = parser.getHeaderInsertionPoint(code);
    assert.strictEqual(insertion.position.line, 2);
  });
});
