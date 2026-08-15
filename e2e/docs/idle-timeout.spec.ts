import { expect, test } from "@playwright/test";

test("docs page is a complete idle-timeout item", async ({ page }) => {
  await page.goto("/docs/idle-timeout");

  await expect(page.getByText("placeholder")).toHaveCount(0);
  await expect(
    page.getByText("bunx shadcn@latest add @app-kit/idle-timeout")
  ).toBeVisible();
  await expect(page.getByText("provider.tsx", { exact: true })).toBeVisible();
  await expect(
    page.getByText("warning-copy.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("continue-vs-refresh.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("cross-tab-sign-out.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("useIdleTimeout()", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(/Implementation reserved for the next pass/i)
  ).toHaveCount(0);
});

test("warning is confirm-dialog alertdialog with overlay focus protocol", async ({
  page,
}) => {
  await page.goto("/idle-timeout-smoke");

  await expect(
    page.getByRole("heading", { name: "idle-timeout smoke" })
  ).toBeVisible();

  const background = page.getByTestId("background");
  await background.focus();
  await expect(background).toBeFocused();

  await expect
    .poll(async () => page.getByText("state:warning").count(), {
      timeout: 5_000,
    })
    .toBe(1);

  const dialog = page.getByRole("alertdialog", { name: "Still there?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("inactivity");

  // Focus stays in the overlay; background is no longer the owner.
  await expect(background).not.toBeFocused();
  await expect(
    page
      .locator('[role="alertdialog"], [role="alertdialog"] *')
      .locator(":focus")
  ).toHaveCount(1);

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("state:active")).toBeVisible();
});
