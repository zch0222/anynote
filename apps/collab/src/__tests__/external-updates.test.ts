import { describe, expect, it } from "vitest";
import { EXTERNAL_UPDATE_CHANNEL_PREFIX, parseExternalUpdateChannel } from "../external-updates.ts";

describe("parseExternalUpdateChannel", () => {
  it("从 collab:note-updated:<id> 取出笔记 id", () => {
    expect(parseExternalUpdateChannel(`${EXTERNAL_UPDATE_CHANNEL_PREFIX}2571`)).toBe(2571);
  });

  it("前缀不对、id 非法或超出安全整数时返回 null", () => {
    expect(parseExternalUpdateChannel("notify_channel:user:1")).toBeNull();
    expect(parseExternalUpdateChannel(`${EXTERNAL_UPDATE_CHANNEL_PREFIX}0`)).toBeNull();
    expect(parseExternalUpdateChannel(`${EXTERNAL_UPDATE_CHANNEL_PREFIX}01`)).toBeNull();
    expect(parseExternalUpdateChannel(`${EXTERNAL_UPDATE_CHANNEL_PREFIX}abc`)).toBeNull();
    expect(
      parseExternalUpdateChannel(`${EXTERNAL_UPDATE_CHANNEL_PREFIX}99999999999999999999`),
    ).toBeNull();
  });
});
