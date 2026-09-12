import { run } from "./run";

const io = {
  out: (chunk: string) => process.stdout.write(chunk),
  err: (chunk: string) => process.stderr.write(chunk),
  isTTY: Boolean(process.stdout.isTTY),
};

const exitCode = await run({ argv: process.argv.slice(2), io });
// 用 exitCode 而不是 process.exit，保证 stdout 写完再退出
process.exitCode = exitCode;
