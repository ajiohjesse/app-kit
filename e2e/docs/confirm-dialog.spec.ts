import { expect, test } from "@playwright/test";

test("docs page is a complete confirm-dialog item", async ({ page }) => {
  await page.goto("/docs/confirm-dialog");

  await expect(page.getByText("placeholder")).toHaveCount(0);
  await expect(
    page.getByText("bunx shadcn@latest add @app-kit/confirm-dialog")
  ).toBeVisible();
  await expect(
    page.getByText("boolean-confirm.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("confirm-and-run.tsx", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("error-path.tsx", { exact: true })).toBeVisible();
  await expect(
    page.getByText("useConfirmDialog()", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(/Implementation reserved for the next pass/i)
  ).toHaveCount(0);
});

test("alertdialog semantics and focus restore", async ({ page }) => {
  await page.goto("/confirm-dialog-smoke");

  await expect(
    page.getByRole("heading", { name: "confirm-dialog smoke" })
  ).toBeVisible();

  const opener = page.getByRole("button", {
    name: "Open confirm",
    exact: true,
  });
  await opener.focus();
  await opener.click();

  const dialog = page.getByRole("alertdialog", { name: "Delete file?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("This cannot be undone.");

  await page.getByRole("button", { name: "Delete" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});
