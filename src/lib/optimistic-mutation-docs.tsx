import type { CompleteDocSlots } from "./complete-docs";
import { OptimisticMutationPreview } from "./optimistic-mutation-preview";

const updateExample = `"use client";

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useOptimisticMutation } from "@/components/optimistic-mutation";

function TodoEditor() {
  const queryClient = useQueryClient();
  const { data: todo } = useQuery({
    queryKey: ["todo", 1],
    queryFn: () => fetchTodo(1),
    initialData: () => queryClient.getQueryData(["todo", 1]),
  });

  const mutation = useOptimisticMutation({
    mutationKey: ["update-todo"],
    queryKeys: [["todo", 1]],
    mutationFn: async (variables: { title: string }) =>
      updateTodo(1, variables.title),
    optimisticUpdate: (variables, { setQueryData }) => {
      setQueryData(["todo", 1], (old) => ({
        ...(old as { id: number; title: string }),
        title: variables.title,
      }));
    },
    onSuccess: {
      reconcile: (data, _variables, { setQueryData }) => {
        setQueryData(["todo", 1], data);
      },
    },
  });

  return (
    <button
      type="button"
      onClick={() => void mutation.mutate({ title: "Renamed" })}
    >
      {todo?.title}
    </button>
  );
}

export function App({ client }: { client: QueryClient }) {
  return (
    <QueryClientProvider client={client}>
      <TodoEditor />
    </QueryClientProvider>
  );
}

async function fetchTodo(_id: number) {
  return { id: 1, title: "Inbox" };
}
async function updateTodo(id: number, title: string) {
  return { id, title };
}
`;

const rollbackExample = `"use client";

import { QueryClient } from "@tanstack/react-query";
import { createOptimisticMutation } from "@/components/optimistic-mutation";

export function createTodoMutation(queryClient: QueryClient) {
  return createOptimisticMutation({
    queryClient,
    mutationKey: ["update-todo"],
    queryKeys: (variables: { id: number }) => [["todo", variables.id]],
    onMissing: "reject",
    mutationFn: async (variables: { id: number; title: string }) => {
      const response = await fetch(\`/api/todos/\${variables.id}\`, {
        method: "PATCH",
        body: JSON.stringify({ title: variables.title }),
      });
      if (!response.ok) throw new Error("save failed");
      return response.json() as Promise<{ id: number; title: string }>;
    },
    optimisticUpdate: (variables, { setQueryData }) => {
      setQueryData(["todo", variables.id], (old) => ({
        ...(old as { id: number; title: string }),
        title: variables.title,
      }));
    },
  });
}
`;

const conflictExample = `"use client";

import { createOptimisticMutation } from "@/components/optimistic-mutation";
import type { QueryClient } from "@tanstack/react-query";

export function createSerialTitleMutation(queryClient: QueryClient) {
  return createOptimisticMutation({
    queryClient,
    mutationKey: ["rename-todo"],
    queryKeys: [["todo", 1]],
    // Wait for the prior attempt; overlapping writes stay ordered.
    conflictPolicy: "serial",
    mutationFn: async (variables: { title: string }) =>
      saveTitle(variables.title),
    optimisticUpdate: (variables, { setQueryData }) => {
      setQueryData(["todo", 1], (old) => ({
        ...(old as { id: number; title: string }),
        title: variables.title,
      }));
    },
  });
}

export function createReplaceTitleMutation(queryClient: QueryClient) {
  return createOptimisticMutation({
    queryClient,
    mutationKey: ["rename-todo"],
    queryKeys: [["todo", 1]],
    // Abort the prior attempt; rollback restores only still-owned keys.
    conflictPolicy: "replace",
    mutationFn: async (variables: { title: string }, { signal }) =>
      saveTitle(variables.title, signal),
    optimisticUpdate: (variables, { setQueryData }) => {
      setQueryData(["todo", 1], (old) => ({
        ...(old as { id: number; title: string }),
        title: variables.title,
      }));
    },
  });
}

async function saveTitle(title: string, _signal?: AbortSignal) {
  return { id: 1, title };
}
`;

const actionRunnerExample = `"use client";

import { useOptimisticMutation } from "@/components/optimistic-mutation";
import { useActionRunner } from "@/components/action-runner";

export function SaveWithRunner() {
  const { run } = useActionRunner();

  const mutation = useOptimisticMutation({
    mutationKey: ["update-todo"],
    queryKeys: [["todo", 1]],
    runAction: (operation) =>
      run((context) => operation({ signal: context.signal }), {
        blocking: { label: "Saving" },
      }),
    mutationFn: async (variables: { title: string }) =>
      updateTodo(variables.title),
    optimisticUpdate: (variables, { setQueryData }) => {
      setQueryData(["todo", 1], (old) => ({
        ...(old as { id: number; title: string }),
        title: variables.title,
      }));
    },
  });

  return (
    <button
      type="button"
      onClick={() => void mutation.mutate({ title: "Saved" })}
    >
      Save
    </button>
  );
}

async function updateTodo(title: string) {
  return { id: 1, title };
}
`;

const serverActionRecipe = `"use server";

export async function updateTodoAction(input: {
  id: number;
  title: string;
}) {
  // Bound Server Action — pass this function as mutationFn from a client
  // component. The helper does not invent a second optimistic model.
  return { id: input.id, title: input.title };
}
`;

const useOptimisticRecipe = `"use client";

import { useOptimistic, useTransition } from "react";
import { useOptimisticMutation } from "@/components/optimistic-mutation";

// useOptimistic owns local UI projection. The helper owns Query cache
// snapshots. They are not synchronized automatically — pick one surface.
export function DualSurfaceEditor({
  todo,
}: {
  todo: { id: number; title: string };
}) {
  const [optimisticTitle, setOptimisticTitle] = useOptimistic(todo.title);
  const [, startTransition] = useTransition();
  const mutation = useOptimisticMutation({
    mutationKey: ["update-todo"],
    queryKeys: [["todo", todo.id]],
    mutationFn: async (variables: { title: string }) =>
      updateTodo(todo.id, variables.title),
    optimisticUpdate: (variables, { setQueryData }) => {
      setQueryData(["todo", todo.id], {
        id: todo.id,
        title: variables.title,
      });
    },
  });

  return (
    <button
      type="button"
      onClick={() => {
        startTransition(() => {
          setOptimisticTitle("Renamed");
          void mutation.mutate({ title: "Renamed" });
        });
      }}
    >
      {optimisticTitle}
    </button>
  );
}

async function updateTodo(id: number, title: string) {
  return { id, title };
}
`;

export const optimisticMutationDocs: CompleteDocSlots = {
  preview: <OptimisticMutationPreview />,
  examples: [
    {
      label: "update.tsx",
      code: updateExample,
      language: "tsx",
    },
    {
      label: "rollback.tsx",
      code: rollbackExample,
      language: "tsx",
    },
    {
      label: "conflict-policy.tsx",
      code: conflictExample,
      language: "tsx",
    },
    {
      label: "action-runner.tsx",
      code: actionRunnerExample,
      language: "tsx",
    },
  ],
  spaRecipes: [
    {
      label: "useOptimistic.tsx",
      code: useOptimisticRecipe,
      language: "tsx",
    },
  ],
  nextRecipes: [
    {
      label: "server-action.ts",
      code: serverActionRecipe,
      language: "tsx",
    },
  ],
  api: (
    <dl>
      <dt>
        <code>createOptimisticMutation(config)</code>
      </dt>
      <dd>
        Requires an injected <code>queryClient</code>. Captures snapshots for
        every declared query key, applies optimistic writes atomically, and
        restores owned snapshots on failure or cancellation.
      </dd>
      <dt>
        <code>useOptimisticMutation(config)</code>
      </dt>
      <dd>
        Hook form. Requires a TanStack <code>QueryClientProvider</code>. Pass{" "}
        <code>queryClient</code> to target a specific client; otherwise the
        nearest provider client is used. Prefer{" "}
        <code>createOptimisticMutation</code> when you already hold a client
        outside React.
      </dd>
      <dt>
        <code>conflictPolicy</code>
      </dt>
      <dd>
        <code>parallel</code> (default), <code>serial</code>, or{" "}
        <code>replace</code> per mutation key. Rollback never clobbers keys
        owned by a newer attempt.
      </dd>
      <dt>
        <code>onMissing</code>
      </dt>
      <dd>
        <code>reject</code> (default), <code>skip</code>, or <code>seed</code>{" "}
        for declared keys with no cached data. Setup validates the full target
        set before any write.
      </dd>
      <dt>
        <code>runAction</code>
      </dt>
      <dd>
        Optional action-runner seam. Optimistic writes happen only inside the
        invoked operation; the mutation function runs exactly once.
      </dd>
      <dt>
        <code>onSuccess.reconcile</code> / <code>invalidateKeys</code>
      </dt>
      <dd>
        After success, write authoritative data and/or invalidate. Invalidation
        runs after reconciliation when both are set. No refetch after rollback
        unless you ask for it.
      </dd>
    </dl>
  ),
  limitations: [
    "TanStack Query is a required peer for this item only — other registry items must not inherit it.",
    "Server Actions and React useOptimistic are documentation recipes; the helper does not combine those models.",
    "action-runner is optional and never a registryDependency.",
  ],
};
