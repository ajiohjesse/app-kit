import { expect, test } from "@playwright/test";

test("error.tsx classifies the failure and retries", async ({ page }) => {
  await page.goto("/error-classification-smoke");

  await expect(
    page.getByRole("heading", { name: "Something went wrong. Try again." })
  ).toBeVisible();

  await page.getByRole("button", { name: "Try again" }).click();

  await expect(
    page.getByRole("heading", { name: "Something went wrong. Try again." })
  ).toBeVisible();
});

test("docs Next recipes use retry() as primary recovery", async ({ page }) => {
  await page.goto("/docs/error-classification");

  await expect(page.getByText("placeholder")).toHaveCount(0);
  await expect(page.getByText("error.tsx", { exact: true })).toBeVisible();
  await expect(
    page.getByText("global-error.tsx", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("Try again").first()).toBeVisible();
  await expect(page.getByText("retry", { exact: true }).first()).toBeVisible();
});
