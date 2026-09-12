import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // `@anynote/api-core` 以 TS 源码形式被 workspace 引用（与 api-client 不同，它有运行时代码），
  // 必须交给 Next 一起编译，否则构建时会把 .ts 当成未编译的 node_modules 产物。
  transpilePackages: ["@anynote/api-core"],
};

export default nextConfig;
