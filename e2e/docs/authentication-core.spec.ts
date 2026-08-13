import { expect, test } from "@playwright/test";

test("docs page is a complete authentication-core item", async ({ page }) => {
  await page.goto("/docs/authentication-core");

  await expect(page.getByText("placeholder")).toHaveCount(0);
  await expect(
    page.getByText("bunx shadcn@latest add @app-kit/authentication-core")
  ).toBeVisible();
  await expect(page.getByText("provider.tsx", { exact: true })).toBeVisible();
  await expect(page.getByText("spa-adapter.ts", { exact: true })).toBeVisible();
  await expect(page.getByText("seed.tsx", { exact: true })).toBeVisible();
  await expect(page.getByText("failure.tsx", { exact: true })).toBeVisible();
  await expect(page.getByText("spa.tsx", { exact: true })).toBeVisible();
  await expect(page.getByText("layout.tsx", { exact: true })).toBeVisible();
  await expect(
    page.getByText("authentication-core.server.ts", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("AuthProvider / useAuth() / useSession()")
  ).toBeVisible();
  await expect(
    page.getByText(/Implementation reserved for the next pass/i)
  ).toHaveCount(0);
});

test("seed hydrates without a loading flash or secrets", async ({ page }) => {
  const logs: string[] = [];
  page.on("console", (message) => {
    logs.push(message.text());
  });

  await page.goto("/authentication-core-smoke");

  await expect(page.getByRole("heading", { name: "Test User" })).toBeVisible();
  await expect(page.getByText("status:authenticated")).toBeVisible();
  await expect(page.getByText("loading")).toHaveCount(0);

  const rendered = await page.locator("main").innerHTML();
  expect(rendered).not.toContain("cookie-session-secret");
  expect(rendered).not.toContain("accessToken");
  expect(logs.join("\n")).not.toContain("cookie-session-secret");
});

test("revoked live session blocks a mutation that re-checks getSession", async ({
  page,
}) => {
  await page.goto("/authentication-core-smoke?revoked=1");

  await expect(page.getByRole("heading", { name: "Test User" })).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("blocked")).toBeVisible();
});
