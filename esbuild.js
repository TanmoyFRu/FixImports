const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

async function copyWasmFiles() {
  const wasmDestDir = path.join(__dirname, 'dist', 'wasm');
  fs.mkdirSync(wasmDestDir, { recursive: true });

  // 1. Copy tree-sitter.wasm from web-tree-sitter
  const webTreeSitterWasm = require.resolve('web-tree-sitter/tree-sitter.wasm');
  fs.copyFileSync(webTreeSitterWasm, path.join(wasmDestDir, 'tree-sitter.wasm'));

  // 2. Copy language wasms from tree-sitter-wasms/out
  const wasmsPkgDir = path.dirname(require.resolve('tree-sitter-wasms/package.json'));
  const wasmsOutDir = path.join(wasmsPkgDir, 'out');

  const neededWasms = [
    'tree-sitter-python.wasm',
    'tree-sitter-typescript.wasm',
    'tree-sitter-javascript.wasm'
  ];

  for (const wasmFile of neededWasms) {
    const src = path.join(wasmsOutDir, wasmFile);
    const dest = path.join(wasmDestDir, wasmFile);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`Copied ${wasmFile} to dist/wasm/`);
    } else {
      console.warn(`Warning: WASM file not found: ${src}`);
    }
  }
}

async function main() {
  await copyWasmFiles();

  const buildOptions = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: isProduction,
    sourcemap: !isProduction,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'info',
  };

  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    console.log('Build completed successfully.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
