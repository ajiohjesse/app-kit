import { test } from "@playwright/test";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

test("the registry install matrix can install a built source item", async () => {
  test.setTimeout(120_000);

  await execFile(process.execPath, ["run", "registry:verify", "--", "modal-manager"], {
    cwd: process.cwd(),
    windowsHide: true,
  });
});
