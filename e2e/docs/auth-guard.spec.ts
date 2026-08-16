import { expect, test } from "@playwright/test";

test("docs page is a complete auth-guard item", async ({ page }) => {
  await page.goto("/docs/auth-guard");

  await expect(page.getByText("placeholder")).toHaveCount(0);
  await expect(
    page.getByText("bunx shadcn@latest add @app-kit/auth-guard")
  ).toBeVisible();
  await expect(
    page.getByText("redirect-without-resume.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("redirect-and-resume.tsx", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("inline.tsx", { exact: true })).toBeVisible();
  await expect(
    page.getByText("guarded-action.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("fail-closed-resume.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("seed-ux-only.tsx", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("spa.tsx", { exact: true })).toBeVisible();
  await expect(
    page.getByText("protected-settings.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("UnauthenticatedPolicy", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(/Implementation reserved for the next pass/i)
  ).toHaveCount(0);
});

test("seed hydrates protected content without a loading flash", async ({
  page,
}) => {
  await page.goto("/auth-guard-smoke");

  await expect(page.getByRole("heading", { name: "Test User" })).toBeVisible();
  await expect(page.getByText("status:authenticated")).toBeVisible();
  await expect(page.getByText("loading")).toHaveCount(0);
});

test("revoked live session cannot run a guarded mutation", async ({ page }) => {
  await page.goto("/auth-guard-smoke?revoked=1");

  await expect(page.getByRole("heading", { name: "Test User" })).toBeVisible();
  await page.getByRole("button", { name: "Guarded save" }).click();
  await expect(page.getByText("authentication-required")).toBeVisible();
});

test("redirect-and-resume stores intent then resumes after sign-in", async ({
  page,
}) => {
  await page.goto("/auth-guard-smoke?resume=1");

  await expect(page.getByText("status:unauthenticated")).toBeVisible();
  await page.getByRole("button", { name: "Guarded resume save" }).click();
  await expect(page.getByText(/result:registered:/)).toBeVisible();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("result:resumed")).toBeVisible();
  await expect(page.getByText("path:/invoices/inv-1")).toBeVisible();
});
