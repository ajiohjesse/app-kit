import { expect, test } from "@playwright/test";

test("docs page is a complete draft-autosave item", async ({ page }) => {
  await page.goto("/docs/draft-autosave");

  await expect(page.getByText("placeholder")).toHaveCount(0);
  await expect(
    page.getByText("bunx shadcn@latest add @app-kit/draft-autosave")
  ).toBeVisible();
  await expect(page.getByText("save-flush.tsx", { exact: true })).toBeVisible();
  await expect(page.getByText("namespace.tsx", { exact: true })).toBeVisible();
  await expect(page.getByText("conflict.tsx", { exact: true })).toBeVisible();
  await expect(
    page.getByText("useDraftAutosave(options)", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(/Implementation reserved for the next pass/i)
  ).toHaveCount(0);
});

test("smoke persists to sessionStorage and tabs do not share records", async ({
  page,
  context,
}) => {
  const pageA = page;
  const pageB = await context.newPage();

  await pageA.goto("/draft-autosave-smoke");
  await pageB.goto("/draft-autosave-smoke");

  await expect(
    pageA.getByRole("heading", { name: "draft-autosave smoke" })
  ).toBeVisible();

  await pageA.getByLabel("title").fill("only-tab-a");
  await pageA.getByRole("button", { name: "Flush" }).click();
  await expect(pageA.getByText("lifecycle:saved")).toBeVisible();
  await expect(pageA.getByText("revision:1")).toBeVisible();
  await expect(pageA.getByText("storageKeys:1")).toBeVisible();

  await expect(pageB.getByText("storageKeys:0")).toBeVisible();
  await pageB.getByRole("button", { name: "Restore" }).click();
  await expect(pageB.getByLabel("title")).toHaveValue("");

  const keysInA = await pageA.evaluate(() => {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith("app-kit:draft-autosave:")) {
        keys.push(key);
      }
    }
    return keys;
  });
  const keysInB = await pageB.evaluate(() => {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith("app-kit:draft-autosave:")) {
        keys.push(key);
      }
    }
    return keys;
  });

  expect(keysInA.length).toBe(1);
  expect(keysInB.length).toBe(0);

  await pageB.close();
});
