import typescript from "@rollup/plugin-typescript";
import { terser } from "rollup-plugin-terser";

export default [
  // ESM/CJS
  {
    input: "src/index.ts",
    output: [
      { file: "dist/index.cjs", format: "cjs", exports: "named" },
      { file: "dist/index.mjs", format: "esm" },
    ],
    plugins: [typescript()],
    external: ["@noble/hashes/legacy", "@noble/hashes/sha3"], // 依存パッケージ名を記載
  },
  // UMD
  {
    input: "src/index.ts",
    output: {
      file: "dist/symbol-sign-on.umd.js",
      format: "umd",
      name: "SymbolSignOn",
      exports: "default",
    },
    plugins: [
      typescript(),
       terser()
      ],
    external: () => false, // 関数で明示的にすべての依存をバンドルに含める
  },
];
