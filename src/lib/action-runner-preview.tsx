"use client";

import {
  ActionRunnerProvider,
  useActionRunner,
} from "../../infra/action-runner";

function PreviewBody() {
  const { run, state, cancel } = useActionRunner();

  return (
    <div className="usage-sketch">
      <p>
        Status: <span className="mono">{state.status}</span>
        {state.error ? (
          <>
            {" "}
            · <span className="mono">{state.error.category}</span>
          </>
        ) : null}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            void run(
              async () => {
                await new Promise((resolve) => setTimeout(resolve, 600));
                return "saved";
              },
              { blocking: { label: "Saving" } }
            );
          }}
        >
          Run success
        </button>
        <button
          type="button"
          onClick={() => {
            void run(async () => {
              await new Promise((resolve) => setTimeout(resolve, 400));
              throw new Error("secret failure detail");
            }).catch(() => undefined);
          }}
        >
          Run failure
        </button>
        <button
          type="button"
          onClick={() => {
            void run(async ({ signal }) => {
              await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(resolve, 5000);
                signal.addEventListener("abort", () => {
                  clearTimeout(timer);
                  reject(
                    Object.assign(new Error("Aborted"), { name: "AbortError" })
                  );
                });
              });
              return "late";
            }).catch(() => undefined);
          }}
        >
          Run long
        </button>
        <button type="button" onClick={() => cancel()}>
          Cancel
        </button>
      </div>
      {state.error ? <p role="alert">{state.error.message}</p> : null}
    </div>
  );
}

export function ActionRunnerPreview() {
  return (
    <ActionRunnerProvider scope="preview">
      <PreviewBody />
    </ActionRunnerProvider>
  );
}
