/**
 * CLI 版本号。产物是单文件 bundle，运行时读不到 package.json，
 * 因此它由构建期生成的 `bundled.ts` 提供（`scripts/build-bundled.mjs` 从 package.json 抄写），
 * 并有单测约束三者一致。
 *
 * 这里只做再导出：版本号出现在 manifest、`--cli-version`、skill 版本戳三处，
 * 多一个副本就多一处漂移点。
 */
export { CLI_VERSION } from "./bundled";
