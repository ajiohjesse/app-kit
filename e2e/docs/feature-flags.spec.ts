import { expect, test } from "@playwright/test";

test("docs page is a complete feature-flags item", async ({ page }) => {
  await page.goto("/docs/feature-flags");

  await expect(page.getByText("placeholder")).toHaveCount(0);
  await expect(
    page.getByText("bunx shadcn@latest add @app-kit/feature-flags")
  ).toBeVisible();
  await expect(page.getByText("flag-schema.ts", { exact: true })).toBeVisible();
  await expect(page.getByText("provider.tsx", { exact: true })).toBeVisible();
  await expect(page.getByText("refresh.tsx", { exact: true })).toBeVisible();
  await expect(
    page.getByText("feature-flags.server.ts", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("createFlagSnapshot(schema, input)")
  ).toBeVisible();
  await expect(
    page.getByText(/Implementation reserved for the next pass/i)
  ).toHaveCount(0);
});

test("bootstrap hydrates without credentials or server-only values", async ({
  page,
}) => {
  await page.goto("/feature-flags-smoke");

  await expect(
    page.getByRole("heading", { name: "feature-flags smoke" })
  ).toBeVisible();
  await expect(page.getByText("checkout:true")).toBeVisible();
  await expect(page.getByText("theme:dark")).toBeVisible();

  const rendered = await page.locator("main").innerHTML();
  expect(rendered).not.toContain("sdk-live-secret");
  expect(rendered).not.toContain("ops-gold");
  expect(rendered).not.toContain("internalPlan");
});
