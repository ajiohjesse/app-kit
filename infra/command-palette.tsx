"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  classifyError,
  type ErrorClassification,
  type ErrorClassifier,
} from "@/infra/error-classification";
import { useShortcut } from "@/infra/keyboard-shortcuts";
import {
  useModalManager,
  type ModalHandle,
} from "@/infra/modal-manager-provider";

export type CommandConfirmSettlement = "confirmed" | "cancelled" | "dismissed";

export type CommandConfirmAdapter = {
  confirm: (options: {
    title: ReactNode;
    description?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
  }) => Promise<CommandConfirmSettlement>;
};

export type CommandNavigateAdapter = {
  navigate: (to: string) => void | Promise<void>;
};

export type CommandAvailability =
  | { status: "available" }
  | { status: "disabled"; reason?: string }
  | { status: "hidden" };

export type CommandGroupMeta = {
  id: string;
  label: string;
  priority?: number;
};

export type CommandDefinition = {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: readonly string[];
  group?: CommandGroupMeta;
  icon?: ReactNode;
  shortcut?: string;
  priority?: number;
  scope?: string;
  replace?: boolean;
  keepOpen?: boolean;
  destructive?: boolean;
  availability?: CommandAvailability | (() => CommandAvailability);
  run?: () => void | Promise<void>;
  navigate?: string;
};

export type CommandExecuteResult =
  | { status: "ran" }
  | { status: "cancelled" }
  | { status: "dismissed" }
  | { status: "disabled"; reason?: string }
  | { status: "hidden" }
  | { status: "not-found" }
  | { status: "error"; error: ErrorClassification };

export type CommandPaletteOpenOptions = {
  scope?: string;
  includeGlobal?: boolean;
};

export type CommandPaletteApi = {
  open: (options?: CommandPaletteOpenOptions) => void;
  close: () => void;
  registerCommand: (command: CommandDefinition) => () => void;
  listCommands: (scope?: string) => CommandDefinition[];
  execute: (id: string) => Promise<CommandExecuteResult>;
  isOpen: boolean;
};

export class CommandRegistrationError extends Error {
  readonly name = "CommandRegistrationError";
  readonly commandId: string;
  readonly scope: string;

  constructor(commandId: string, scope: string) {
    super(
      `Command "${commandId}" is already registered in scope "${scope}". Pass replace: true to overwrite.`
    );
    this.commandId = commandId;
    this.scope = scope;
  }
}

export class CommandDestructiveConfirmRequiredError extends Error {
  readonly name = "CommandDestructiveConfirmRequiredError";
  readonly commandId: string;

  constructor(commandId: string) {
    super(
      `Destructive command "${commandId}" requires a CommandPaletteProvider confirm adapter.`
    );
    this.commandId = commandId;
  }
}

const DEFAULT_SCOPE = "global";
const DEFAULT_GROUP: CommandGroupMeta = {
  id: "commands",
  label: "Commands",
  priority: 0,
};
const DEFAULT_TITLE = "Command palette";
const DEFAULT_DESCRIPTION = "Search and run a command.";
const DEFAULT_SHORTCUT = "Mod+K";

type StoredCommand = CommandDefinition & {
  scope: string;
  order: number;
};

class PaletteStore {
  commands = new Map<string, StoredCommand>();
  order = 0;
  listeners = new Set<() => void>();
  snapshot: CommandDefinition[] = [];

  publish() {
    this.snapshot = [...this.commands.values()].map((stored) => {
      const { order: _ignored, ...command } = stored;
      void _ignored;
      return command;
    });
    for (const listener of this.listeners) {
      listener();
    }
  }

  register(command: CommandDefinition): () => void {
    const scope = command.scope ?? DEFAULT_SCOPE;
    const key = storageKey(scope, command.id);
    const existing = this.commands.get(key);
    if (existing && !command.replace) {
      throw new CommandRegistrationError(command.id, scope);
    }

    this.order += 1;
    const stored: StoredCommand = {
      ...command,
      scope,
      order: existing?.order ?? this.order,
    };
    this.commands.set(key, stored);
    this.publish();

    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      const current = this.commands.get(key);
      if (current === stored) {
        this.commands.delete(key);
        this.publish();
      }
    };
  }

  list(scope = DEFAULT_SCOPE): CommandDefinition[] {
    return [...this.commands.values()]
      .filter((command) => command.scope === scope)
      .sort(compareCommands)
      .map((stored) => {
        const { order: _ignored, ...command } = stored;
        void _ignored;
        return command;
      });
  }

  find(id: string): StoredCommand | undefined {
    return (
      this.commands.get(storageKey(DEFAULT_SCOPE, id)) ??
      [...this.commands.values()].find((entry) => entry.id === id)
    );
  }
}

function storageKey(scope: string, id: string) {
  return `${scope}::${id}`;
}

function resolveAvailability(command: CommandDefinition): CommandAvailability {
  if (!command.availability) {
    return { status: "available" };
  }
  return typeof command.availability === "function"
    ? command.availability()
    : command.availability;
}

function compareCommands(left: StoredCommand, right: StoredCommand) {
  const leftPriority = left.priority ?? 0;
  const rightPriority = right.priority ?? 0;
  if (leftPriority !== rightPriority) {
    return rightPriority - leftPriority;
  }
  return left.order - right.order;
}

type PaletteContextValue = {
  store: PaletteStore;
  registerCommand: (command: CommandDefinition) => () => void;
  listCommands: (scope?: string) => CommandDefinition[];
  execute: (id: string) => Promise<CommandExecuteResult>;
  open: (options?: CommandPaletteOpenOptions) => void;
  close: () => void;
  isOpen: boolean;
  setHostOpen: (
    opener: ((options?: CommandPaletteOpenOptions) => void) | null
  ) => void;
  setHostClose: (closer: (() => void) | null) => void;
  setIsOpen: (open: boolean) => void;
};

const CommandPaletteContext = createContext<PaletteContextValue | null>(null);

function usePaletteContext(): PaletteContextValue {
  const context = useContext(CommandPaletteContext);
  if (!context) {
    throw new Error(
      "Command palette hooks require a CommandPaletteProvider ancestor."
    );
  }
  return context;
}

function useCommandSnapshot(store: PaletteStore) {
  return useSyncExternalStore(
    (listener) => {
      store.listeners.add(listener);
      return () => {
        store.listeners.delete(listener);
      };
    },
    () => store.snapshot,
    () => store.snapshot
  );
}

export function CommandPaletteProvider({
  children,
  confirm,
  navigate,
  classifiers,
}: {
  children: ReactNode;
  confirm?: CommandConfirmAdapter;
  navigate?: CommandNavigateAdapter;
  classifiers?: readonly ErrorClassifier[];
}) {
  const [store] = useState(() => new PaletteStore());

  const hostOpenRef = useRef<
    ((options?: CommandPaletteOpenOptions) => void) | null
  >(null);
  const hostCloseRef = useRef<(() => void) | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const confirmRef = useRef(confirm);
  const navigateRef = useRef(navigate);
  const classifiersRef = useRef(classifiers);

  useEffect(() => {
    confirmRef.current = confirm;
    navigateRef.current = navigate;
    classifiersRef.current = classifiers;
  }, [confirm, navigate, classifiers]);

  const registerCommand = useCallback(
    (command: CommandDefinition) => store.register(command),
    [store]
  );

  const listCommands = useCallback(
    (scope = DEFAULT_SCOPE) => store.list(scope),
    [store]
  );

  const execute = useCallback(
    async (id: string): Promise<CommandExecuteResult> => {
      const command = store.find(id);

      if (!command) {
        return { status: "not-found" };
      }

      const availability = resolveAvailability(command);
      if (availability.status === "hidden") {
        return { status: "hidden" };
      }
      if (availability.status === "disabled") {
        return { status: "disabled", reason: availability.reason };
      }

      if (command.destructive) {
        const confirmAdapter = confirmRef.current;
        if (!confirmAdapter) {
          throw new CommandDestructiveConfirmRequiredError(command.id);
        }
        const settlement = await confirmAdapter.confirm({
          title: command.title,
          description: command.subtitle,
          destructive: true,
        });
        if (settlement === "cancelled") {
          return { status: "cancelled" };
        }
        if (settlement === "dismissed") {
          return { status: "dismissed" };
        }
      }

      try {
        if (command.navigate !== undefined) {
          const adapter = navigateRef.current;
          if (!adapter) {
            throw new Error(
              `Command "${command.id}" uses navigate but no navigate adapter was provided.`
            );
          }
          await adapter.navigate(command.navigate);
        } else if (command.run) {
          await command.run();
        }
        return { status: "ran" };
      } catch (error) {
        if (error instanceof CommandDestructiveConfirmRequiredError) {
          throw error;
        }
        return {
          status: "error",
          error: classifyError(error, {
            classifiers: classifiersRef.current,
          }),
        };
      }
    },
    [store]
  );

  const open = useCallback((options?: CommandPaletteOpenOptions) => {
    hostOpenRef.current?.(options);
  }, []);

  const close = useCallback(() => {
    hostCloseRef.current?.();
  }, []);

  const setHostOpen = useCallback(
    (opener: ((options?: CommandPaletteOpenOptions) => void) | null) => {
      hostOpenRef.current = opener;
    },
    []
  );

  const setHostClose = useCallback((closer: (() => void) | null) => {
    hostCloseRef.current = closer;
  }, []);

  const value = useMemo<PaletteContextValue>(
    () => ({
      store,
      registerCommand,
      listCommands,
      execute,
      open,
      close,
      isOpen,
      setHostOpen,
      setHostClose,
      setIsOpen,
    }),
    [
      store,
      registerCommand,
      listCommands,
      execute,
      open,
      close,
      isOpen,
      setHostOpen,
      setHostClose,
    ]
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette(): CommandPaletteApi {
  const context = usePaletteContext();
  useCommandSnapshot(context.store);
  return {
    open: context.open,
    close: context.close,
    registerCommand: context.registerCommand,
    listCommands: context.listCommands,
    execute: context.execute,
    isOpen: context.isOpen,
  };
}

export function useCommandRegistration(command: CommandDefinition) {
  // Read registerCommand from context without subscribing to the command
  // snapshot — otherwise re-publish on register re-renders this hook and loops.
  const { registerCommand } = usePaletteContext();
  const commandRef = useRef(command);
  useEffect(() => {
    commandRef.current = command;
  });

  const {
    id,
    title,
    subtitle,
    shortcut,
    priority,
    scope,
    replace,
    keepOpen,
    destructive,
    navigate,
  } = command;
  const hasRun = typeof command.run === "function";
  const hasAvailability = command.availability !== undefined;
  const keywordsKey = (command.keywords ?? []).join("\0");
  const groupKey = command.group
    ? `${command.group.id}\0${command.group.label}\0${command.group.priority ?? ""}`
    : "";

  useEffect(() => {
    const current = commandRef.current;
    return registerCommand({
      id: current.id,
      title: current.title,
      subtitle: current.subtitle,
      keywords: current.keywords,
      group: current.group,
      icon: current.icon,
      shortcut: current.shortcut,
      priority: current.priority,
      scope: current.scope,
      replace: current.replace,
      keepOpen: current.keepOpen,
      destructive: current.destructive,
      navigate: current.navigate,
      run: hasRun
        ? () => {
            return commandRef.current.run?.();
          }
        : undefined,
      availability: hasAvailability
        ? () => resolveAvailability(commandRef.current)
        : undefined,
    });
  }, [
    registerCommand,
    id,
    title,
    subtitle,
    shortcut,
    priority,
    scope,
    replace,
    keepOpen,
    destructive,
    navigate,
    hasRun,
    hasAvailability,
    keywordsKey,
    groupKey,
  ]);
}

export function CommandRegistration({
  command,
}: {
  command: CommandDefinition;
}) {
  useCommandRegistration(command);
  return null;
}

function visibleCommands(
  commands: readonly CommandDefinition[],
  scope: string,
  includeGlobal: boolean
) {
  return commands
    .filter((command) => {
      if (command.scope === scope) {
        return true;
      }
      return (
        includeGlobal &&
        command.scope === DEFAULT_SCOPE &&
        scope !== DEFAULT_SCOPE
      );
    })
    .filter((command) => resolveAvailability(command).status !== "hidden")
    .sort((left, right) => {
      const leftPriority = left.priority ?? 0;
      const rightPriority = right.priority ?? 0;
      if (leftPriority !== rightPriority) {
        return rightPriority - leftPriority;
      }
      return left.title.localeCompare(right.title);
    });
}

function groupCommands(commands: readonly CommandDefinition[]) {
  const groups = new Map<
    string,
    { meta: CommandGroupMeta; items: CommandDefinition[] }
  >();

  for (const command of commands) {
    const meta = command.group ?? DEFAULT_GROUP;
    const existing = groups.get(meta.id);
    if (existing) {
      existing.items.push(command);
    } else {
      groups.set(meta.id, { meta, items: [command] });
    }
  }

  return [...groups.values()].sort((left, right) => {
    const leftPriority = left.meta.priority ?? 0;
    const rightPriority = right.meta.priority ?? 0;
    if (leftPriority !== rightPriority) {
      return rightPriority - leftPriority;
    }
    return left.meta.label.localeCompare(right.meta.label);
  });
}

function CommandSurface({
  commands,
  error,
  pendingId,
  onSelect,
}: {
  commands: readonly CommandDefinition[];
  error: ErrorClassification | null;
  pendingId: string | null;
  onSelect: (command: CommandDefinition) => void;
}) {
  const groups = groupCommands(commands);

  return (
    <Command className="rounded-lg border-0 shadow-none" shouldFilter>
      <CommandInput placeholder="Type a command..." autoFocus />
      <CommandList>
        <CommandEmpty>No commands found.</CommandEmpty>
        {groups.map(({ meta, items }) => (
          <CommandGroup key={meta.id} heading={meta.label}>
            {items.map((command) => {
              const availability = resolveAvailability(command);
              const disabled =
                availability.status === "disabled" || pendingId !== null;
              return (
                <CommandItem
                  key={`${command.scope ?? DEFAULT_SCOPE}:${command.id}`}
                  value={`${command.title} ${command.subtitle ?? ""} ${(command.keywords ?? []).join(" ")}`}
                  disabled={disabled}
                  onSelect={() => {
                    if (availability.status === "disabled") {
                      return;
                    }
                    onSelect(command);
                  }}
                >
                  {command.icon}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{command.title}</span>
                    {command.subtitle ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {command.subtitle}
                      </span>
                    ) : null}
                    {availability.status === "disabled" &&
                    availability.reason ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {availability.reason}
                      </span>
                    ) : null}
                  </span>
                  {command.shortcut ? (
                    <CommandShortcut>{command.shortcut}</CommandShortcut>
                  ) : null}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
      {error ? (
        <p className="px-3 pb-2 text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}
    </Command>
  );
}

function PaletteBody({
  scope,
  includeGlobal,
  onCloseAfterRun,
}: {
  scope: string;
  includeGlobal: boolean;
  onCloseAfterRun: () => void;
}) {
  const { store, execute } = usePaletteContext();
  const snapshot = useCommandSnapshot(store);
  const [error, setError] = useState<ErrorClassification | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const commands = visibleCommands(snapshot, scope, includeGlobal);

  return (
    <CommandSurface
      commands={commands}
      error={error}
      pendingId={pendingId}
      onSelect={(command) => {
        void (async () => {
          setError(null);
          setPendingId(command.id);
          try {
            // Destructive confirm runs while the palette is still open.
            // Default execution closes before run unless keepOpen is set.
            if (command.destructive) {
              const preflight = await execute(command.id);
              if (preflight.status === "error") {
                setError(preflight.error);
                return;
              }
              if (
                preflight.status === "cancelled" ||
                preflight.status === "dismissed"
              ) {
                return;
              }
              // Already ran inside execute after confirm — close unless keepOpen.
              if (!command.keepOpen) {
                onCloseAfterRun();
              }
              return;
            }

            if (!command.keepOpen) {
              onCloseAfterRun();
            }
            const result = await execute(command.id);
            if (result.status === "error") {
              setError(result.error);
            }
          } catch (caught) {
            if (caught instanceof CommandDestructiveConfirmRequiredError) {
              // Protocol miss: confirm adapter required. Not a classified runtime error.
              return;
            }
            throw caught;
          } finally {
            setPendingId(null);
          }
        })();
      }}
    />
  );
}

export function CommandPaletteHost({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  shortcut = DEFAULT_SHORTCUT,
}: {
  title?: string;
  description?: string;
  shortcut?: string;
}) {
  const modals = useModalManager();
  const { setHostOpen, setHostClose, setIsOpen } = usePaletteContext();
  const handleRef = useRef<ModalHandle | null>(null);

  const closePalette = useCallback(() => {
    const handle = handleRef.current;
    if (!handle) {
      return;
    }
    void modals.close(handle.id, "dismissed");
  }, [modals]);

  const openPalette = useCallback(
    (options?: CommandPaletteOpenOptions) => {
      if (handleRef.current) {
        return;
      }

      const scope = options?.scope ?? DEFAULT_SCOPE;
      const includeGlobal = options?.includeGlobal ?? true;

      const handle = modals.open({
        surface: "dialog",
        title,
        description,
        closeOnEscape: true,
        closeOnBackdrop: true,
        content: ({ close }) => (
          <PaletteBody
            scope={scope}
            includeGlobal={includeGlobal}
            onCloseAfterRun={() => {
              close("confirmed");
            }}
          />
        ),
        onClose: async () => {
          handleRef.current = null;
          setIsOpen(false);
        },
      });

      handleRef.current = handle;
      setIsOpen(true);
      void handle.result.finally(() => {
        if (handleRef.current?.id === handle.id) {
          handleRef.current = null;
          setIsOpen(false);
        }
      });
    },
    [description, modals, setIsOpen, title]
  );

  useEffect(() => {
    setHostOpen(openPalette);
    setHostClose(closePalette);
    return () => {
      setHostOpen(null);
      setHostClose(null);
    };
  }, [closePalette, openPalette, setHostClose, setHostOpen]);

  useShortcut({
    shortcut,
    handler: () => {
      openPalette();
    },
    exclusive: true,
  });

  return null;
}

export function CommandPaletteEmbed({
  scope = DEFAULT_SCOPE,
  includeGlobal = false,
  className,
}: {
  scope?: string;
  includeGlobal?: boolean;
  className?: string;
}) {
  return (
    <div className={className} data-slot="command-palette-embed">
      <PaletteBody
        scope={scope}
        includeGlobal={includeGlobal}
        onCloseAfterRun={() => {}}
      />
    </div>
  );
}
