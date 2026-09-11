import Mocha from 'mocha';
import * as path from 'path';

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
  path.join(__dirname, 'suite/fixtures.test.ts')
];

for (const file of testFiles) {
  mocha.addFile(file);
}

mocha.run(failures => {
  process.exitCode = failures ? 1 : 0;
});
