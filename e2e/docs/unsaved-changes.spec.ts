import { expect, test } from "@playwright/test";

test("docs page is a complete unsaved-changes item", async ({ page }) => {
  await page.goto("/docs/unsaved-changes");

  await expect(page.getByText("placeholder")).toHaveCount(0);
  await expect(
    page.getByText("bunx shadcn@latest add @app-kit/unsaved-changes")
  ).toBeVisible();
  await expect(page.getByText("dirty-flag.tsx", { exact: true })).toBeVisible();
  await expect(
    page.getByText("confirm-leave.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("one-shot-retry.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("next-limitation.tsx", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("spa-router.tsx", { exact: true })).toBeVisible();
  await expect(
    page.getByText("next-app-router.tsx", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("useUnsavedChanges(options)", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(/in-app navigation blocking is best-effort/i)
  ).toBeVisible();
  await expect(
    page.getByText(/Implementation reserved for the next pass/i)
  ).toHaveCount(0);
});

test("smoke confirms leave once and registers unload while dirty", async ({
  page,
}) => {
  await page.goto("/unsaved-changes-smoke");

  await expect(
    page.getByRole("heading", { name: "unsaved-changes smoke" })
  ).toBeVisible();

  await page.getByLabel("note").fill("draft");
  await expect(page.getByText("dirty:yes")).toBeVisible();

  await page.getByRole("button", { name: "Probe beforeunload" }).click();
  await expect(page.getByText("beforeUnloadBound:yes")).toBeVisible();

  await page.getByRole("main").getByRole("button", { name: "Leave" }).click();
  const dialog = page.getByRole("alertdialog", {
    name: "Leave without saving?",
  });
  await expect(dialog).toBeVisible();
  // Modal host keeps a single alertdialog; stacked confirms are covered in Vitest.
  await expect(page.getByRole("alertdialog")).toHaveCount(1);

  await dialog.getByRole("button", { name: "Stay" }).click();
  await expect(page.getByText("outcome:cancelled")).toBeVisible();
  await expect(page.getByText("navCount:0")).toBeVisible();
  await expect(page.getByText("dirty:yes")).toBeVisible();

  await page.getByRole("main").getByRole("button", { name: "Leave" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Leave" })
    .click();
  await expect(page.getByText("outcome:navigated")).toBeVisible();
  await expect(page.getByText("navCount:1")).toBeVisible();
});
