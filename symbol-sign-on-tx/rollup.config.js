import typescript from "@rollup/plugin-typescript";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from '@rollup/plugin-json';
import terser from '@rollup/plugin-terser';
import { visualizer } from 'rollup-plugin-visualizer';
import nodePolyfills from 'rollup-plugin-polyfill-node';

export default {
  input: "src/index.ts",
  output: {
    file: "dist/symbol-sign-tx.js",
    format: "esm",
    sourcemap: true,
  },
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
      requireReturnsDefault: "auto",
      // side effectsのない変換を強制
      ignoreDynamicRequires: true,
    }),
    typescript({
      // tree shakingを有効にするための設定
      module: "esnext",
      target: "es2020", // より互換性のあるターゲットに変更
      declaration: false, // ビルド時は型定義を生成しない
    }),
    terser({
      // 未使用コードの削除を強化
      compress: {
        unused: true,
        dead_code: true,
        drop_debugger: true,
        drop_console: false,
        pure_funcs: [],
        // さらなる最適化
        passes: 2,
        pure_getters: true,
        unsafe: true,
        unsafe_comps: true,
        unsafe_math: true,
        unsafe_methods: true,
      },
      mangle: {
        toplevel: true,
        properties: {
          regex: /^_/,
        },
      },
    }),
    // バンドルサイズの分析レポートを生成
    visualizer({
      filename: 'dist/bundle-stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  // external: ["crypto", "path", "fs"], // ブラウザ用polyfillを使用するためコメントアウト

  // tree shakingの最適化
  treeshake: {
    moduleSideEffects: false,
    propertyReadSideEffects: false,
    tryCatchDeoptimization: false,
    unknownGlobalSideEffects: false,
    // より積極的な未使用コード削除
    preset: 'recommended',
  },
};
