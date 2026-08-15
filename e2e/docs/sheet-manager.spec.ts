import { expect, test } from "@playwright/test";

test("docs page is a complete sheet-manager item", async ({ page }) => {
  await page.goto("/docs/sheet-manager");

  await expect(page.getByText("placeholder")).toHaveCount(0);
  await expect(
    page.getByText("bunx shadcn@latest add @app-kit/sheet-manager")
  ).toBeVisible();
  await expect(page.getByText("open.tsx", { exact: true })).toBeVisible();
  await expect(page.getByText("replace.tsx", { exact: true })).toBeVisible();
  await expect(page.getByText("nested.tsx", { exact: true })).toBeVisible();
  await expect(
    page.getByText("compose-modal.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("useSheetManager()", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(/Implementation reserved for the next pass/i)
  ).toHaveCount(0);
});

test("sheet over modal: z-order, inertness, escape, and focus restore", async ({
  page,
}) => {
  await page.goto("/sheet-manager-smoke");

  await expect(
    page.getByRole("heading", { name: "sheet-manager smoke" })
  ).toBeVisible();

  const opener = page.getByRole("button", { name: "Open account" });
  await opener.focus();
  await opener.click();

  const modal = page.getByRole("dialog", { name: "Account" });
  await expect(modal).toBeVisible();
  await expect(page.getByRole("button", { name: "Open sheet" })).toBeFocused();

  await page.getByRole("button", { name: "Open sheet" }).click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute("data-slot", "sheet-content");
  await expect(
    page.locator('[data-slot="dialog-content"][inert]').filter({
      hasText: "Account",
    })
  ).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(page.getByText("Account body")).toBeAttached();
  await expect(page.getByRole("dialog", { name: "Account" })).toBeVisible();
  await expect(page.locator('[data-slot="dialog-content"][inert]')).toHaveCount(
    0
  );
  await expect(page.getByRole("button", { name: "Open sheet" })).toBeFocused();

  await page.getByRole("button", { name: "Close account" }).click();
  await expect(page.getByRole("dialog", { name: "Account" })).toHaveCount(0);
  await expect(opener).toBeFocused();
});
