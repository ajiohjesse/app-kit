"use client";

import { classifyError } from "../../../infra/error-classification";

export default function ErrorPage({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const classified = classifyError(error);

  return (
    <main>
      <h1>{classified.message}</h1>
      <button type="button" onClick={() => retry()}>
        Try again
      </button>
    </main>
  );
}
