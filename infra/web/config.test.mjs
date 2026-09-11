import assert from "node:assert/strict";
import { test } from "node:test";
import { validateContainerConfig } from "./config.mjs";

const built = {
  NEXT_PUBLIC_APP_URL: "https://notes.example.com",
  NEXT_PUBLIC_COLLAB_WS_URL: "wss://notes.example.com/collab",
};
const valid = {
  ...built,
  DEPLOYMENT_ENV: "production",
  INTERNAL_API_URL: "http://anynote-gateway:8080",
  COLLAB_TOKEN_SECRET: "production-test-secret-32-characters",
};
test("生产配置允许内网 HTTP Gateway 与外部 HTTPS/WSS", () => {
  assert.doesNotThrow(() => validateContainerConfig(valid, built));
});
test("拒绝只改运行时域名却未重新构建的镜像", () => {
  assert.throws(
    () =>
      validateContainerConfig(
        { ...valid, NEXT_PUBLIC_APP_URL: "https://other.example.com" },
        built,
      ),
    /重新构建/,
  );
});
test("生产禁止开发密钥、空密钥与桌面令牌交换", () => {
  for (const secret of ["", "short", "anynote-collab-dev-secret"]) {
    assert.throws(
      () => validateContainerConfig({ ...valid, COLLAB_TOKEN_SECRET: secret }, built),
      /COLLAB_TOKEN_SECRET/,
    );
  }
  assert.throws(
    () => validateContainerConfig({ ...valid, DESKTOP_EXCHANGE_KEY: "unexpected" }, built),
    /DESKTOP_EXCHANGE_KEY/,
  );
});
test("生产禁止 HTTP、非同源协同地址和来源中的路径", () => {
  for (const publicConfig of [
    { ...built, NEXT_PUBLIC_APP_URL: "http://notes.example.com" },
    { ...built, NEXT_PUBLIC_APP_URL: "https://notes.example.com/path" },
    { ...built, NEXT_PUBLIC_COLLAB_WS_URL: "ws://notes.example.com/collab" },
    { ...built, NEXT_PUBLIC_COLLAB_WS_URL: "wss://other.example.com/collab" },
  ]) {
    assert.throws(() => validateContainerConfig({ ...valid, ...publicConfig }, publicConfig));
  }
});
test("本地容器保留 HTTP 与直连协同端口", () => {
  const local = {
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_COLLAB_WS_URL: "ws://localhost:1234",
  };
  assert.doesNotThrow(() =>
    validateContainerConfig(
      {
        ...valid,
        ...local,
        DEPLOYMENT_ENV: "development",
        COLLAB_TOKEN_SECRET: "anynote-collab-dev-secret",
      },
      local,
    ),
  );
});
test("缺失网关或非法部署模式失败，不静默退回 localhost", () => {
  assert.throws(() => validateContainerConfig({ ...valid, INTERNAL_API_URL: "" }, built));
  assert.throws(() => validateContainerConfig({ ...valid, DEPLOYMENT_ENV: "prodution" }, built));
});
