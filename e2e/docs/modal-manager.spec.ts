import { expect, test } from "@playwright/test";

test("docs page is a complete modal-manager item", async ({ page }) => {
  await page.goto("/docs/modal-manager");

  await expect(page.getByText("placeholder")).toHaveCount(0);
  await expect(
    page.getByText("bunx shadcn@latest add @app-kit/modal-manager")
  ).toBeVisible();
  await expect(page.getByText("stack.tsx", { exact: true })).toBeVisible();
  await expect(page.getByText("replace.tsx", { exact: true })).toBeVisible();
  await expect(
    page.getByText("alert-dialog.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("overlay-layer.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("useModalManager()", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(/Implementation reserved for the next pass/i)
  ).toHaveCount(0);
});

test("nested inertness, focus restore, and suspend blocking escape", async ({
  page,
}) => {
  await page.goto("/modal-manager-smoke");

  await expect(
    page.getByRole("heading", { name: "modal-manager smoke" })
  ).toBeVisible();

  const opener = page.getByRole("button", { name: "Open account" });
  await opener.focus();
  await opener.click();

  await expect(page.getByRole("dialog", { name: "Account" })).toBeVisible();

  await page.getByRole("button", { name: "Open nested" }).click();
  const nested = page.getByRole("dialog", { name: "Confirm email" });
  await expect(nested).toBeVisible();
  await expect(nested).toHaveAttribute("data-nested");
  await expect(
    page
      .locator('[data-slot="dialog-content"][data-nested-dialog-open]')
      .filter({ hasText: "Account" })
  ).toHaveCount(1);

  await page.getByRole("button", { name: "Close nested" }).click();
  await expect(nested).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open nested" })).toBeFocused();

  await page.getByRole("button", { name: "Close account" }).click();
  await expect(page.getByRole("dialog", { name: "Account" })).toHaveCount(0);
  await expect(opener).toBeFocused();

  await opener.click();
  await expect(page.getByRole("dialog", { name: "Account" })).toBeVisible();
  await page.getByRole("button", { name: "Suspend stack" }).click();
  await expect(
    page.locator('[data-slot="dialog-content"][inert]').filter({
      hasText: "Account",
    })
  ).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByText("Account body")).toBeAttached();
});

test("alert-dialog surface exposes alertdialog semantics", async ({ page }) => {
  await page.goto("/modal-manager-smoke");
  await page.getByRole("button", { name: "Open confirm" }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Delete file?" })
  ).toBeVisible();
});
