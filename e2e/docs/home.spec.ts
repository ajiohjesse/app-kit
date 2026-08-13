import { expect, test } from "@playwright/test";

test("documentation home page loads", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/app-kit/i);
  await expect(
    page.getByRole("heading", {
      name: /Infrastructure you can understand and own/i,
    })
  ).toBeVisible();
  await expect(
    page.getByText("Twenty pieces of application infrastructure.")
  ).toBeVisible();
});
