import { expect, test } from "@playwright/test";

test("docs page is a complete pending-auth-action item", async ({ page }) => {
  await page.goto("/docs/pending-auth-action");

  await expect(page.getByText("placeholder")).toHaveCount(0);
  await expect(
    page.getByText("bunx shadcn@latest add @app-kit/pending-auth-action")
  ).toBeVisible();
  await expect(
    page.getByText("register-intent.tsx", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("resume.tsx", { exact: true })).toBeVisible();
  await expect(
    page.getByText("fail-closed.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("PendingAuthActionProvider / usePendingAuthAction()")
  ).toBeVisible();
  await expect(
    page.getByText(/Implementation reserved for the next pass/i)
  ).toHaveCount(0);
});

test("post-auth resume claims navigate and dispatches", async ({ page }) => {
  await page.goto("/pending-auth-action-smoke");

  await expect(page.getByText("status:unauthenticated")).toBeVisible();
  await page.getByRole("button", { name: "Register intent" }).click();
  await expect(page.getByText(/result:registered:/)).toBeVisible();

  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Test User" })).toBeVisible();

  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByText("result:succeeded")).toBeVisible();
  await expect(page.getByText("path:/invoices/inv-1")).toBeVisible();
});
