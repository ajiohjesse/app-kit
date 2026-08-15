import { expect, test } from "@playwright/test";

test("boundary recovery does not wait on report completion", async ({
  page,
}) => {
  await page.goto("/error-reporting-smoke");

  await expect(
    page.getByRole("heading", { name: "error-reporting smoke" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Something went wrong. Try again.",
    })
  ).toBeVisible();
  await expect(page.getByTestId("report-started")).toHaveText("yes");
  await expect(page.getByTestId("report-finished")).toHaveText("no");

  await page.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByTestId("recovered")).toBeVisible();
  await expect(page.getByTestId("report-finished")).toHaveText("no");
});

test("docs Next recipes use retry() and stay complete", async ({ page }) => {
  await page.goto("/docs/error-reporting");

  await expect(page.getByText("placeholder")).toHaveCount(0);
  await expect(page.getByText("error.tsx", { exact: true })).toBeVisible();
  await expect(
    page.getByText("global-error.tsx", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("consent.tsx", { exact: true })).toBeVisible();
  await expect(page.getByText("Try again").first()).toBeVisible();
  await expect(page.getByText("retry", { exact: true }).first()).toBeVisible();
});
