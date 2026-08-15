import { expect, test } from "@playwright/test";

test("docs page is a complete session-refresh item", async ({ page }) => {
  await page.goto("/docs/session-refresh");

  await expect(page.getByText("placeholder")).toHaveCount(0);
  await expect(
    page.getByText("bunx shadcn@latest add @app-kit/session-refresh")
  ).toBeVisible();
  await expect(
    page.getByText("coordinator.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("replay-policy.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("401-recovery.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("SessionRefreshProvider / useSessionRefresh()")
  ).toBeVisible();
  await expect(
    page.getByText(/Implementation reserved for the next pass/i)
  ).toHaveCount(0);
});

test("smoke recovers a read after refresh", async ({ page }) => {
  await page.goto("/session-refresh-smoke");

  await expect(page.getByRole("heading", { name: "Test User" })).toBeVisible();
  await page.getByRole("button", { name: "Recover read" }).click();
  await expect(page.getByText("result:ok")).toBeVisible();
  await expect(page.getByText("refreshCount:1")).toBeVisible();
});
