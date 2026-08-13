import { expect, test } from "@playwright/test";

test("docs page is a complete keyboard-shortcuts item", async ({ page }) => {
  await page.goto("/docs/keyboard-shortcuts");

  await expect(page.getByText("placeholder")).toHaveCount(0);
  await expect(
    page.getByText("bunx shadcn@latest add @app-kit/keyboard-shortcuts")
  ).toBeVisible();
  await expect(page.getByText("register-shortcut.tsx")).toBeVisible();
  await expect(page.getByText("platform-label.tsx")).toBeVisible();
  await expect(page.getByText("conflict.ts")).toBeVisible();
  await expect(page.getByText("useShortcut(registration)")).toBeVisible();
  await expect(
    page.getByText(/Implementation reserved for the next pass/i)
  ).toHaveCount(0);
});

test("real keyboard fires, suppresses in inputs, and allows opt-in", async ({
  page,
}) => {
  await page.goto("/keyboard-shortcuts-smoke");

  await expect(
    page.getByRole("heading", { name: "keyboard-shortcuts smoke" })
  ).toBeVisible();

  await page.keyboard.press("Alt+Shift+K");
  await expect(page.getByText("blocked: 1")).toBeVisible();

  await page.getByLabel("note").focus();
  await page.keyboard.press("Alt+Shift+K");
  await expect(page.getByText("blocked: 1")).toBeVisible();

  await page.keyboard.press("Alt+Shift+P");
  await expect(page.getByText("allowed: 1")).toBeVisible();
});
