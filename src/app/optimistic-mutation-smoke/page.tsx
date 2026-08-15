"use client";

import { useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useOptimisticMutation } from "../../../infra/optimistic-mutation";

function SmokeBody() {
  const [failNext, setFailNext] = useState(false);
  const [pending, setPending] = useState(false);
  const queryClient = useQueryClient();

  const { data: todo } = useQuery({
    queryKey: ["smoke-todo"],
    queryFn: async () =>
      queryClient.getQueryData<{ id: number; title: string }>([
        "smoke-todo",
      ]) ?? {
        id: 1,
        title: "Inbox",
      },
    initialData: { id: 1, title: "Inbox" },
  });

  const mutation = useOptimisticMutation<
    { title: string },
    { id: number; title: string }
  >({
    mutationKey: ["smoke-update-todo"],
    queryKeys: [["smoke-todo"]],
    mutationFn: async (variables) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (failNext) {
        throw new Error("save failed");
      }
      return { id: 1, title: variables.title };
    },
    optimisticUpdate: (variables, { setQueryData }) => {
      setQueryData(["smoke-todo"], (old) => ({
        ...(old as { id: number; title: string }),
        title: variables.title,
      }));
    },
    onSuccess: {
      reconcile: (data, _variables, { setQueryData }) => {
        setQueryData(["smoke-todo"], data);
      },
    },
  });

  return (
    <main>
      <h1>optimistic-mutation smoke</h1>
      <p data-testid="todo-title">{todo.title}</p>
      <p data-testid="pending">{pending ? "pending" : "idle"}</p>
      <label>
        <input
          type="checkbox"
          data-testid="fail-next"
          checked={failNext}
          onChange={(event) => setFailNext(event.target.checked)}
        />{" "}
        Fail next
      </label>
      <button
        type="button"
        onClick={() => {
          setPending(true);
          void mutation
            .mutate({ title: "Optimistic" })
            .catch(() => undefined)
            .finally(() => setPending(false));
        }}
      >
        Save optimistic
      </button>
    </main>
  );
}

export default function OptimisticMutationSmokePage() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
  );

  return (
    <QueryClientProvider client={client}>
      <SmokeBody />
    </QueryClientProvider>
  );
}
