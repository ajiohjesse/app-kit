import { expect, test } from "@playwright/test";

test("the clean App Router consumer loads", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Next fixture" })).toBeVisible();
  await expect(page.getByTestId("consumer-kind")).toHaveText("next-app-router");
});
