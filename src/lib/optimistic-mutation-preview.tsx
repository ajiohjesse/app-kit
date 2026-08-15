"use client";

import { useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useOptimisticMutation } from "../../infra/optimistic-mutation";

function PreviewBody() {
  const [failNext, setFailNext] = useState(false);
  const queryClient = useQueryClient();
  const { data: todo } = useQuery({
    queryKey: ["preview-todo"],
    queryFn: async () =>
      queryClient.getQueryData<{ id: number; title: string }>([
        "preview-todo",
      ]) ?? { id: 1, title: "Inbox" },
    initialData: { id: 1, title: "Inbox" },
  });

  const mutation = useOptimisticMutation<
    { title: string },
    { id: number; title: string }
  >({
    mutationKey: ["preview-update-todo"],
    queryKeys: [["preview-todo"]],
    mutationFn: async (variables) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (failNext) {
        throw new Error("save failed");
      }
      return { id: 1, title: variables.title };
    },
    optimisticUpdate: (variables, { setQueryData }) => {
      setQueryData(["preview-todo"], (old) => ({
        ...(old as { id: number; title: string }),
        title: variables.title,
      }));
    },
    onSuccess: {
      reconcile: (data, _variables, { setQueryData }) => {
        setQueryData(["preview-todo"], data);
      },
    },
  });

  return (
    <div className="usage-sketch">
      <p>
        Title: <span data-testid="preview-title">{todo.title}</span>
      </p>
      <label>
        <input
          type="checkbox"
          checked={failNext}
          onChange={(event) => setFailNext(event.target.checked)}
        />{" "}
        Fail next save
      </label>
      <button
        type="button"
        onClick={() => {
          void mutation.mutate({ title: `${todo.title} ★` }).catch(() => {
            /* rollback is visible in cache */
          });
        }}
      >
        Optimistic rename
      </button>
    </div>
  );
}

export function OptimisticMutationPreview() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
  );

  return (
    <QueryClientProvider client={client}>
      <PreviewBody />
    </QueryClientProvider>
  );
}
