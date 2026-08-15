import { expect, test } from "@playwright/test";

test("docs page is a complete optimistic-mutation item", async ({ page }) => {
  await page.goto("/docs/optimistic-mutation");

  await expect(page.getByText("placeholder")).toHaveCount(0);
  await expect(
    page.getByText("bunx shadcn@latest add @app-kit/optimistic-mutation")
  ).toBeVisible();
  await expect(page.getByText("update.tsx", { exact: true })).toBeVisible();
  await expect(page.getByText("rollback.tsx", { exact: true })).toBeVisible();
  await expect(
    page.getByText("conflict-policy.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("action-runner.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("server-action.ts", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("useOptimistic.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("createOptimisticMutation(config)", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(/Implementation reserved for the next pass/i)
  ).toHaveCount(0);
});

test("visible optimistic state then success keep", async ({ page }) => {
  await page.goto("/optimistic-mutation-smoke");

  await expect(
    page.getByRole("heading", { name: "optimistic-mutation smoke" })
  ).toBeVisible();
  await expect(page.getByTestId("todo-title")).toHaveText("Inbox");

  await page.getByRole("button", { name: "Save optimistic" }).click();
  await expect(page.getByTestId("todo-title")).toHaveText("Optimistic");
  await expect(page.getByTestId("pending")).toHaveText("pending");
  await expect(page.getByTestId("pending")).toHaveText("idle");
  await expect(page.getByTestId("todo-title")).toHaveText("Optimistic");
});

test("rollback restores prior cache after failed mutation", async ({
  page,
}) => {
  await page.goto("/optimistic-mutation-smoke");

  await page.getByTestId("fail-next").check();
  await page.getByRole("button", { name: "Save optimistic" }).click();
  await expect(page.getByTestId("todo-title")).toHaveText("Optimistic");
  await expect(page.getByTestId("pending")).toHaveText("pending");
  await expect(page.getByTestId("todo-title")).toHaveText("Inbox");
  await expect(page.getByTestId("pending")).toHaveText("idle");
});
