import { expect, test } from "@playwright/test";

test("docs page is a complete command-palette item", async ({ page }) => {
  await page.goto("/docs/command-palette");

  await expect(page.getByText("placeholder")).toHaveCount(0);
  await expect(
    page.getByText("bunx shadcn@latest add @app-kit/command-palette")
  ).toBeVisible();
  await expect(page.getByText("register.tsx", { exact: true })).toBeVisible();
  await expect(
    page.getByText("global-host.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("local-embed.tsx", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("error-path.tsx", { exact: true })).toBeVisible();
  await expect(
    page.getByText("useCommandPalette()", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(/Implementation reserved for the next pass/i)
  ).toHaveCount(0);
});

test("one dialog role, keyboard open, and focus", async ({ page }) => {
  await page.goto("/command-palette-smoke");

  await expect(
    page.getByRole("heading", { name: "command-palette smoke" })
  ).toBeVisible();

  const opener = page.getByRole("button", { name: "Open palette" });
  await opener.focus();
  await opener.click();

  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByPlaceholder("Type a command...")).toBeFocused();
  await expect(dialog).toContainText("Go to inbox");

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  await page.keyboard.press("Control+K");
  await expect(
    page.getByRole("dialog", { name: "Command palette" })
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByPlaceholder("Type a command...")).toBeFocused();
});
