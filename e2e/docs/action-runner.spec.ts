import { expect, test } from "@playwright/test";

test("docs page is a complete action-runner item", async ({ page }) => {
  await page.goto("/docs/action-runner");

  await expect(page.getByText("placeholder")).toHaveCount(0);
  await expect(
    page.getByText("bunx shadcn@latest add @app-kit/action-runner")
  ).toBeVisible();
  await expect(page.getByText("basic-run.tsx", { exact: true })).toBeVisible();
  await expect(
    page.getByText("confirm-blocking.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("server-action.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("useActionRunner()", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(/Implementation reserved for the next pass/i)
  ).toHaveCount(0);
});

test("confirm then blocking success and fail", async ({ page }) => {
  await page.goto("/action-runner-smoke");

  await expect(
    page.getByRole("heading", { name: "action-runner smoke" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Confirm then block" }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Start work?" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Start" }).click();

  const overlay = page.locator(
    "[data-loading-overlay-scope=smoke] [data-slot=loading-overlay]"
  );
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-status", "loading");
  await expect(page.getByTestId("runner-status")).toHaveText("pending");

  await page.getByRole("button", { name: "Resolve pending" }).click();
  await expect(page.getByTestId("runner-status")).toHaveText("succeeded");

  await page.getByRole("button", { name: "Confirm then fail" }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Fail after confirm?" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByTestId("runner-status")).toHaveText("failed");
  await expect(page.getByTestId("runner-error")).toBeVisible();
  await expect(page.getByTestId("runner-error")).not.toContainText(
    "secret failure detail"
  );
});

test("confirm cancel skips the action", async ({ page }) => {
  await page.goto("/action-runner-smoke");

  await page.getByRole("button", { name: "Confirm then block" }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Start work?" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("runner-status")).toHaveText("cancelled");
});
