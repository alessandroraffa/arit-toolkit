import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {esbuild.Plugin} */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      });
      console.log('[watch] build finished');
    });
  },
};

/**
 * The published bundle is deliberately NOT minified, and ships a source map.
 *
 * A minified bundle is indistinguishable from an obfuscated one to a static
 * scanner, and Marketplace review guidance treats obfuscation as a suspicion
 * signal. Minification buys almost nothing here: roughly 98% of the bundle is
 * tokenizer vocabulary data (js-tiktoken and @anthropic-ai/tokenizer), and the
 * extension's own code is about 119 KB. Skipping minification costs ~2% of the
 * bundle size and makes the shipped code readable line by line.
 *
 * @type {esbuild.BuildOptions}
 */
const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  minify: false,
  sourcemap: true,
  sourcesContent: false,
  platform: 'node',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  logLevel: 'silent',
  plugins: [esbuildProblemMatcherPlugin],
};

async function main() {
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    console.log(production ? 'Production build complete' : 'Development build complete');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
