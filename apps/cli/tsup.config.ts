import { defineConfig } from "tsup";

export default defineConfig({
  entry: { anynote: "src/main.ts" },
  format: ["esm"],
  target: "node22",
  outExtension: () => ({ js: ".mjs" }),
  // 单文件产出：agent 沙箱里可以脱离 pnpm workspace 软链直接 `node dist/anynote.mjs`。
  // tsup 默认把 dependencies 视作 external，这里必须显式全量内联——
  // 尤其是 @anynote/api-core，它以 TS 源码形式存在，不内联的话运行时 Node 根本加载不了。
  bundle: true,
  noExternal: [/.*/],
  splitting: false,
  clean: true,
  sourcemap: true,
  // commander 等依赖是 CJS，内联进 ESM 产物后 esbuild 会生成 __require 垫片；
  // 这里补一个真正的 require，否则加载 node 内建模块会抛 "Dynamic require is not supported"。
  banner: {
    js: [
      "#!/usr/bin/env node",
      "import { createRequire as __anynoteCreateRequire } from 'node:module';",
      "const require = __anynoteCreateRequire(import.meta.url);",
    ].join("\n"),
  },
});
