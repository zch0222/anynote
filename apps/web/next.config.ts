import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * standalone 只服务于 Docker 镜像拷贝（infra/Dockerfile.web）。
   * 宿主机 `next build` 在无软链权限的 Windows 上会在 standalone 追踪步
   * 报 EPERM symlink；显式声明 NEXT_DISABLE_STANDALONE=1 时跳过（本机
   * E2E 用 `next start` 起普通 .next 产物即可）。临时开关，默认行为不变。
   */
  ...(process.env.NEXT_DISABLE_STANDALONE === "1" ? {} : { output: "standalone" }),
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // `@anynote/api-core` 以 TS 源码形式被 workspace 引用（与 api-client 不同，它有运行时代码），
  // 必须交给 Next 一起编译，否则构建时会把 .ts 当成未编译的 node_modules 产物。
  transpilePackages: ["@anynote/api-core"],
};

export default nextConfig;
