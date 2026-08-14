import { expect, test } from "@playwright/test";

test("docs page is a complete loading-overlay item", async ({ page }) => {
  await page.goto("/docs/loading-overlay");

  await expect(page.getByText("placeholder")).toHaveCount(0);
  await expect(
    page.getByText("bunx shadcn@latest add @app-kit/loading-overlay")
  ).toBeVisible();
  await expect(page.getByText("global.tsx", { exact: true })).toBeVisible();
  await expect(page.getByText("scoped.tsx", { exact: true })).toBeVisible();
  await expect(
    page.getByText("token-lifecycle.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("non-blocking.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("useLoadingOverlay()", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(/Implementation reserved for the next pass/i)
  ).toHaveCount(0);
});

test("blocking overlay takes foreground over a modal and restores it", async ({
  page,
}) => {
  await page.goto("/loading-overlay-smoke");

  await expect(
    page.getByRole("heading", { name: "loading-overlay smoke" })
  ).toBeVisible();

  const opener = page.getByRole("button", { name: "Open account" });
  await opener.focus();
  await opener.click();
  await expect(page.getByRole("dialog", { name: "Account" })).toBeVisible();

  await page.getByRole("button", { name: "Show blocking overlay" }).click();
  const overlay = page.locator("[data-slot=loading-overlay]").first();
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-blocking", "true");
  await expect(
    page.locator('[data-slot="dialog-content"][inert]').filter({
      hasText: "Account",
    })
  ).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(page.getByText("Account body")).toBeAttached();

  await expect(overlay).toHaveCount(0, { timeout: 3000 });
  await expect(page.getByRole("dialog", { name: "Account" })).toBeVisible();
  await expect(page.locator('[data-slot="dialog-content"][inert]')).toHaveCount(
    0
  );
  await expect
    .poll(async () =>
      page.evaluate(() =>
        Boolean(document.activeElement?.closest('[role="dialog"]'))
      )
    )
    .toBe(true);
});

test("non-blocking overlay does not take focus or inert the page", async ({
  page,
}) => {
  await page.goto("/loading-overlay-smoke");

  const note = page.getByLabel("note");
  await note.focus();

  await page.getByRole("button", { name: "Show non-blocking overlay" }).click();
  const overlay = page.locator(
    "[data-loading-overlay-scope=panel] [data-slot=loading-overlay]"
  );
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-blocking", "false");

  await note.focus();
  await expect(note).toBeFocused();
  await expect(page.getByText("Page content stays interactive.")).toBeVisible();
  await expect(page.locator("main")).not.toHaveAttribute("inert");

  await page.keyboard.press("Escape");
  await expect(overlay).toBeVisible();
  await expect(note).toBeFocused();
});
