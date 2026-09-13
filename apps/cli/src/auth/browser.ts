import { spawn } from "node:child_process";

/**
 * 打开系统默认浏览器。
 *
 * 三个平台各一条命令，都不经过 shell（避免 URL 里的 `&` 被解释成命令分隔符——
 * 授权链接恰好带 `?port=&state=&challenge=` 三个参数，走 shell 必然被截断）。
 *
 * 失败不抛错：无头环境（CI / ssh）打不开浏览器是常态，调用方应该把链接打印出来
 * 让用户手工打开，而不是让整条登录命令崩掉。
 */
const OPENERS: Record<string, [string, string[]]> = {
  darwin: ["open", []],
  win32: ["cmd", ["/c", "start", ""]],
  linux: ["xdg-open", []],
};

export function browserCommand(
  platform: string,
  url: string,
): { command: string; args: string[] } | null {
  const opener = OPENERS[platform];
  if (!opener) return null;
  return { command: opener[0], args: [...opener[1], url] };
}

/** 尽力打开浏览器；返回是否成功发起（不保证浏览器真的显示了页面）。 */
export function openBrowser(url: string, platform: string = process.platform): Promise<boolean> {
  const target = browserCommand(platform, url);
  if (!target) return Promise.resolve(false);

  return new Promise((resolve) => {
    try {
      const child = spawn(target.command, target.args, {
        stdio: "ignore",
        detached: true,
      });
      child.on("error", () => resolve(false));
      child.on("spawn", () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}
