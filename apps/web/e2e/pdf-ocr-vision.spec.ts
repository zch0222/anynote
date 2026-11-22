import { expect, test } from "@playwright/test";
import type { E2EAccount } from "./global-setup";
import { createAdminAccount, loginForProviderTest } from "./support/model-provider";
import { setTheme } from "./support/theme";

test.use({ storageState: { cookies: [], origins: [] } });

let admin: E2EAccount;
test.beforeAll(async () => {
  admin = await createAdminAccount();
});

test("主模型视觉开关在深浅色下可辨且不出现在其他逻辑模型", async ({ page }) => {
  await loginForProviderTest(page, admin);
  await page.goto("/settings/providers");
  const toggle = page.getByTestId("agent_main-supports-vision-input");
  await expect(toggle).toBeVisible();
  await expect(page.getByText("支持页面图像输入", { exact: true })).toHaveCount(1);
  await expect(page.getByTestId("logical-model-settings-fast")).not.toContainText(
    "支持页面图像输入",
  );
  await expect(page.getByTestId("logical-model-settings-embedding")).not.toContainText(
    "支持页面图像输入",
  );

  const initial = await toggle.isChecked();
  await toggle.setChecked(!initial);
  await expect(toggle).toBeChecked({ checked: !initial });
  await toggle.setChecked(initial);
  await expect(toggle).toBeChecked({ checked: initial });

  await setTheme(page, "深色");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await toggle.scrollIntoViewIfNeeded();
  await expect(toggle).toBeVisible();
  const darkAccent = await toggle.evaluate((element) => getComputedStyle(element).accentColor);
  expect(darkAccent).not.toBe("rgba(0, 0, 0, 0)");
  const darkBackground = await page
    .getByTestId("logical-model-settings-agent_main")
    .evaluate((element) => getComputedStyle(element).backgroundColor);

  await setTheme(page, "浅色");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  const lightAccent = await toggle.evaluate((element) => getComputedStyle(element).accentColor);
  expect(lightAccent).not.toBe("rgba(0, 0, 0, 0)");
  const lightBackground = await page
    .getByTestId("logical-model-settings-agent_main")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(lightBackground).not.toBe(darkBackground);
});
