import { expect, test } from "@playwright/test";

test("the clean SPA consumer loads", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "SPA fixture" })).toBeVisible();
  await expect(page.getByTestId("consumer-kind")).toHaveText("spa-vite");
});
