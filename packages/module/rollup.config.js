import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import terser from '@rollup/plugin-terser'
import typescript from '@rollup/plugin-typescript'
import nodePolyfills from 'rollup-plugin-polyfill-node'
import { visualizer } from 'rollup-plugin-visualizer'
import dts from 'rollup-plugin-dts';

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/node/symbol-sign-on.mjs',
        format: 'es',
        sourcemap: true,
      },
      {
        file: 'dist/umd/symbol-sign-on.umd.js',
        format: 'umd',
        name: 'SymbolSignOn',
        sourcemap: true,
      },
    ],
    plugins: [
      nodePolyfills(),
      nodeResolve({
        browser: true,
        preferBuiltins: false,
        // tree shakingを有効にする
        modulesOnly: true,
        // 特定の依存関係のみを解決
        exportConditions: ['module', 'import', 'browser'],
      }),
      json(),
      commonjs({
        // tree shakingのサポートを向上
        requireReturnsDefault: 'auto',
        // side effectsのない変換を強制
        ignoreDynamicRequires: true,
      }),
      typescript({
        // tree shakingを有効にするための設定
        module: 'esnext',
        target: 'es2020', // より互換性のあるターゲットに変更
        declaration: false, // ビルド時は型定義を生成しない
      }),
      terser({
        // 未使用コードの削除を強化
        compress: {
          unused: true,
          dead_code: true,
          drop_debugger: true,
          drop_console: false,
          // BigInt関連の問題を避けるため最適化を控えめに
          passes: 1,
          pure_getters: false,
          unsafe: false,
          unsafe_comps: false,
          unsafe_math: false,
          unsafe_methods: false,
          // BigInt値の変換を避ける
          evaluate: false,
          reduce_vars: false,
        },
        mangle: {
          toplevel: true,
          properties: {
            regex: /^_/,
          },
        },
        // BigInt関連のエラーを避けるため
        ecma: 2020,
      }),
      // バンドルサイズの分析レポートを生成
      visualizer({
        filename: 'dist/bundle-stats.html',
        open: false,
        gzipSize: true,
        brotliSize: true,
      }),
    ],
    external: [],

    // tree shakingの最適化
    treeshake: {
      moduleSideEffects: false,
      propertyReadSideEffects: false,
      tryCatchDeoptimization: false,
      unknownGlobalSideEffects: false,
      // より積極的な未使用コード削除
      preset: 'recommended',
    },
  },
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/node/index.d.ts',
      format: 'es',
    },
    plugins: [dts()],
  },
];
