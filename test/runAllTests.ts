import Mocha from 'mocha';
import * as path from 'path';

// Provide mock for 'vscode' when running unit tests outside VS Code host
const Module = require('module');
const origRequire = Module.prototype.require;
Module.prototype.require = function(modPath: string) {
  if (modPath === 'vscode') {
    return {
      Range: class {
        constructor(public startLine: number, public startChar: number, public endLine: number, public endChar: number) {}
        get start() { return { line: this.startLine, character: this.startChar }; }
        get end() { return { line: this.endLine, character: this.endChar }; }
      },
      Position: class {
        constructor(public line: number, public character: number) {}
      },
      TextEdit: class {
        constructor(public range: any, public newText: string) {}
      },
      WorkspaceEdit: class {
        set() {}
      },
      workspace: {
        getConfiguration: () => ({
          get: (_k: string, def: any) => def
        }),
        applyEdit: async () => true
      }
    };
  }
  return origRequire.apply(this, arguments);
};

const mocha = new Mocha({
  ui: 'bdd',
  color: true,
  timeout: 10000
});

const testFiles = [
  path.join(__dirname, 'suite/pythonParser.test.ts'),
  path.join(__dirname, 'suite/tsParser.test.ts'),
  path.join(__dirname, 'suite/editPlanner.test.ts'),
  path.join(__dirname, 'suite/regexParser.test.ts'),
  path.join(__dirname, 'suite/fixtures.test.ts'),
  path.join(__dirname, 'suite/fixer.test.ts')
];

for (const file of testFiles) {
  mocha.addFile(file);
}

mocha.run(failures => {
  process.exitCode = failures ? 1 : 0;
});
