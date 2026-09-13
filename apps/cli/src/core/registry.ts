import { authLogin, authLogout, authRegister, authStatus, authWhoami } from "../commands/auth";
import { baseCreate, baseGet, baseList, baseRemove, baseUpdate } from "../commands/base";
import { configGet, configPath, configSet, configUnset, doctor, manifest } from "../commands/meta";
import {
  noteCreate,
  noteGet,
  noteList,
  noteMove,
  noteRecent,
  noteRemove,
  noteSet,
} from "../commands/note";
import { skillInstall, skillList, skillUninstall } from "../commands/skill";
import type { RegisteredCommand } from "./command";

/**
 * 命令注册表：CLI 解析、manifest 生成、（后续的）MCP 工具三处共用的单一事实源。
 * 新增命令只需在这里登记，文档与 agent 接口自动跟上。
 */
export const registry: RegisteredCommand[] = [
  authLogin,
  authRegister,
  authLogout,
  authWhoami,
  authStatus,
  baseList,
  baseGet,
  baseCreate,
  baseUpdate,
  baseRemove,
  noteList,
  noteRecent,
  noteGet,
  noteCreate,
  noteSet,
  noteMove,
  noteRemove,
  skillInstall,
  skillList,
  skillUninstall,
  manifest,
  doctor,
  configPath,
  configGet,
  configSet,
  configUnset,
];

export function findCommand(commands: RegisteredCommand[], argv: string[]) {
  // 命令名可能是两段（"note get"），先长后短匹配，避免 "note" 前缀吞掉子命令
  for (const length of [2, 1]) {
    const candidate = argv.slice(0, length).join(" ");
    const found = commands.find((command) => command.name === candidate);
    if (found) return { command: found, rest: argv.slice(length) };
  }
  return null;
}
