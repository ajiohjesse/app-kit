import { expect, test } from "@playwright/test";

test("docs page is a complete alert-prompt-dialog item", async ({ page }) => {
  await page.goto("/docs/alert-prompt-dialog");

  await expect(page.getByText("placeholder")).toHaveCount(0);
  await expect(
    page.getByText("bunx shadcn@latest add @app-kit/alert-prompt-dialog")
  ).toBeVisible();
  await expect(page.getByText("alert.tsx", { exact: true })).toBeVisible();
  await expect(page.getByText("prompt.tsx", { exact: true })).toBeVisible();
  await expect(page.getByText("validate.tsx", { exact: true })).toBeVisible();
  await expect(
    page.getByText("useAlertPromptDialog()", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(/Implementation reserved for the next pass/i)
  ).toHaveCount(0);
});

test("alert and prompt roles, keyboard submit, and dismiss", async ({
  page,
}) => {
  await page.goto("/alert-prompt-dialog-smoke");

  await expect(
    page.getByRole("heading", { name: "alert-prompt-dialog smoke" })
  ).toBeVisible();

  const alertOpener = page.getByRole("button", { name: "Open alert" });
  await alertOpener.focus();
  await alertOpener.click();

  const alertDialog = page.getByRole("alertdialog", { name: "Saved" });
  await expect(alertDialog).toBeVisible();
  await expect(alertDialog).toContainText("Your draft is stored in this tab.");
  await expect(page.getByRole("button", { name: "OK" })).toBeFocused();
  await page.getByRole("button", { name: "OK" }).click();
  await expect(alertDialog).toHaveCount(0);
  await expect(alertOpener).toBeFocused();

  const promptOpener = page.getByRole("button", { name: "Open prompt" });
  await promptOpener.focus();
  await promptOpener.click();

  const promptDialog = page.getByRole("dialog", { name: "Rename file" });
  await expect(promptDialog).toBeVisible();
  const input = page.getByRole("textbox", { name: "File name" });
  await expect(input).toBeFocused();
  await input.fill("readme.md");
  await page.keyboard.press("Enter");
  await expect(promptDialog).toHaveCount(0);
  await expect(promptOpener).toBeFocused();

  await promptOpener.click();
  await expect(page.getByRole("dialog", { name: "Rename file" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Rename file" })).toHaveCount(
    0
  );
  await expect(promptOpener).toBeFocused();
});
