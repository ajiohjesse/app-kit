import { expect, test } from "@playwright/test";

test("docs page is a complete offline-banner item", async ({ page }) => {
  await page.goto("/docs/offline-banner");

  await expect(page.getByText("placeholder")).toHaveCount(0);
  await expect(
    page.getByText("bunx shadcn@latest add @app-kit/offline-banner")
  ).toBeVisible();
  await expect(page.getByText("provider.tsx", { exact: true })).toBeVisible();
  await expect(page.getByText("banner.tsx", { exact: true })).toBeVisible();
  await expect(page.getByText("probe.tsx", { exact: true })).toBeVisible();
  await expect(
    page.getByText("useConnectivity()", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(/Implementation reserved for the next pass/i)
  ).toHaveCount(0);
});

test("banner is visible while offline and is not an overlay layer", async ({
  page,
  context,
}) => {
  await page.goto("/offline-banner-smoke");

  await expect(
    page.getByRole("heading", { name: "offline-banner smoke" })
  ).toBeVisible();

  const note = page.getByLabel("note");
  await note.focus();

  await context.setOffline(true);

  const banner = page.getByRole("status");
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute("aria-live", "polite");
  await expect(banner).toHaveAttribute("aria-atomic", "true");
  await expect(banner).toHaveText(/you are offline/i);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(banner).not.toHaveAttribute("aria-modal", "true");
  await expect(note).toBeFocused();
  await expect(page.locator("main")).not.toHaveAttribute("inert");
  await expect(page.getByText("Page content stays interactive.")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(banner).toBeVisible();
  await expect(note).toBeFocused();

  await context.setOffline(false);
  await expect(page.getByRole("status")).toHaveText(/back online/i);
  await expect(page.getByText("state: online")).toBeVisible();
});
