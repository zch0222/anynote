import { defineConfig } from "tsup";

/**
 * 协同服务打包成单文件。
 *
 * `@anynote/editor-core` 是 TS 源码包，连同它依赖的 TipTap / ProseMirror 一起打进产物；
 * jsdom（运行时读取自身资源文件）与 ws（可选原生依赖）保持外部依赖，由运行镜像安装。
 */
export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: [/^(?!(jsdom|ws|bufferutil|utf-8-validate)(\/|$)).*/],
  external: ["jsdom", "ws", "bufferutil", "utf-8-validate"],
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
});
