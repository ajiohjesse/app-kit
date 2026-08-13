"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

export type ShortcutPlatform = "mac" | "windows";
export type ShortcutRepeatPolicy = "ignore" | "allow";

export type NormalizedShortcutEvent = {
  chord: string;
  key: string;
  code: string;
  repeat: boolean;
  nativeEvent: KeyboardEvent;
};

export type ShortcutRegistryContext = {
  scope: string;
  id?: string;
};

export type ShortcutHandler = (
  event: NormalizedShortcutEvent,
  context: ShortcutRegistryContext
) => void;

export type ShortcutRegistration = {
  shortcut: string;
  handler: ShortcutHandler;
  scope?: string;
  id?: string;
  priority?: number;
  exclusive?: boolean;
  allowInInputs?: boolean;
  repeat?: ShortcutRepeatPolicy;
  preventDefault?: boolean;
};

export type ShortcutScopeOptions = {
  compose?: boolean;
};

type StoredRegistration = {
  chord: string;
  handler: ShortcutHandler;
  scope: string;
  id?: string;
  priority: number;
  exclusive: boolean;
  allowInInputs: boolean;
  repeat: ShortcutRepeatPolicy;
  preventDefault: boolean;
  order: number;
};

type ActiveScope = {
  name: string;
  compose: boolean;
};

export class ShortcutConflictError extends Error {
  readonly name = "ShortcutConflictError";
  readonly chord: string;
  readonly scope: string;

  constructor(chord: string, scope: string) {
    super(`Shortcut ${chord} is already registered in scope ${scope}`);
    this.chord = chord;
    this.scope = scope;
  }
}

const MODIFIER_ORDER = ["Mod", "Ctrl", "Meta", "Alt", "Shift"] as const;
const MAC_DISPLAY_ORDER = ["Ctrl", "Alt", "Shift", "Mod", "Meta"] as const;

const ALIASES: Record<string, string> = {
  control: "Ctrl",
  ctrl: "Ctrl",
  command: "Meta",
  cmd: "Meta",
  meta: "Meta",
  win: "Meta",
  windows: "Meta",
  option: "Alt",
  alt: "Alt",
  opt: "Alt",
  shift: "Shift",
  mod: "Mod",
  escape: "Escape",
  esc: "Escape",
  space: "Space",
  plus: "Plus",
};

const MAC_SYMBOLS: Record<string, string> = {
  Mod: "⌘",
  Meta: "⌘",
  Ctrl: "⌃",
  Alt: "⌥",
  Shift: "⇧",
};

function detectShortcutPlatform(): ShortcutPlatform {
  if (typeof navigator === "undefined") {
    return "windows";
  }
  const platform = navigator.platform ?? "";
  const userAgent = navigator.userAgent ?? "";
  if (/Mac|iPhone|iPod|iPad/i.test(platform) || /Mac OS/i.test(userAgent)) {
    return "mac";
  }
  return "windows";
}

function isModifier(token: string): token is (typeof MODIFIER_ORDER)[number] {
  return (MODIFIER_ORDER as readonly string[]).includes(token);
}

function looksLikeSequence(input: string): boolean {
  return /\s|,|then/i.test(input);
}

function semanticModifier(token: string, platform: ShortcutPlatform): string {
  if (token === "Ctrl" && platform !== "mac") {
    return "Mod";
  }
  if (token === "Meta" && platform === "mac") {
    return "Mod";
  }
  return token;
}

function normalizeToken(raw: string): string {
  const aliased = ALIASES[raw.toLowerCase()];
  if (aliased) {
    return aliased;
  }
  if (raw.length === 1) {
    return raw.toUpperCase();
  }
  return raw[0].toUpperCase() + raw.slice(1);
}

export function canonicalizeShortcut(
  input: string,
  platform: ShortcutPlatform = detectShortcutPlatform()
): string {
  if (looksLikeSequence(input)) {
    throw new Error(
      "Sequences are not supported; use a single chord such as Mod+K."
    );
  }

  const tokens = input
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new Error("Shortcut must be a single chord such as Mod+K.");
  }

  const modifiers: string[] = [];
  let key: string | undefined;

  for (const raw of tokens) {
    const token = semanticModifier(normalizeToken(raw), platform);
    if (isModifier(token)) {
      if (!modifiers.includes(token)) {
        modifiers.push(token);
      }
      continue;
    }
    if (key) {
      throw new Error(
        "Sequences are not supported; use a single chord such as Mod+K."
      );
    }
    key = token;
  }

  if (!key) {
    throw new Error("Shortcut must include a key.");
  }

  modifiers.sort(
    (left, right) =>
      MODIFIER_ORDER.indexOf(left as (typeof MODIFIER_ORDER)[number]) -
      MODIFIER_ORDER.indexOf(right as (typeof MODIFIER_ORDER)[number])
  );

  return [...modifiers, key].join("+");
}

export function formatShortcut(
  input: string,
  platform: ShortcutPlatform = detectShortcutPlatform()
): string {
  const canonical = canonicalizeShortcut(input, platform);
  const parts = canonical.split("+");
  const key = parts.pop()!;

  if (platform === "mac") {
    const ordered = [...parts].sort(
      (left, right) =>
        MAC_DISPLAY_ORDER.indexOf(left as (typeof MAC_DISPLAY_ORDER)[number]) -
        MAC_DISPLAY_ORDER.indexOf(right as (typeof MAC_DISPLAY_ORDER)[number])
    );
    return `${ordered.map((part) => MAC_SYMBOLS[part] ?? part).join("")}${key}`;
  }

  const labels = parts.map((part) => {
    if (part === "Mod") {
      return "Ctrl";
    }
    if (part === "Meta") {
      return "Win";
    }
    return part;
  });
  return [...labels, key].join("+");
}

const DEFAULT_SCOPE = "global";

function isModifierKey(key: string): boolean {
  return (
    key === "Control" ||
    key === "Shift" ||
    key === "Alt" ||
    key === "Meta" ||
    key === "OS"
  );
}

function chordFromEvent(
  event: KeyboardEvent,
  platform: ShortcutPlatform
): string | undefined {
  if (isModifierKey(event.key)) {
    return undefined;
  }

  const tokens: string[] = [];
  const ctrlIsMod = platform !== "mac";
  const metaIsMod = platform === "mac";

  if (event.metaKey && metaIsMod) {
    tokens.push("Mod");
  }
  if (event.ctrlKey && ctrlIsMod) {
    tokens.push("Mod");
  }
  if (event.ctrlKey && !ctrlIsMod) {
    tokens.push("Ctrl");
  }
  if (event.metaKey && !metaIsMod) {
    tokens.push("Meta");
  }
  if (event.altKey) {
    tokens.push("Alt");
  }
  if (event.shiftKey) {
    tokens.push("Shift");
  }

  const key =
    event.key === " " ? "Space" : event.key === "+" ? "Plus" : event.key;
  return canonicalizeShortcut([...tokens, key].join("+"), platform);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const contentEditable = target.getAttribute("contenteditable");
  if (
    target.isContentEditable ||
    contentEditable === "" ||
    contentEditable === "true"
  ) {
    return true;
  }
  const tag = target.tagName;
  if (tag === "TEXTAREA") {
    return true;
  }
  if (tag !== "INPUT") {
    return false;
  }
  const type = (target as HTMLInputElement).type;
  return ![
    "button",
    "checkbox",
    "radio",
    "file",
    "submit",
    "reset",
    "image",
    "range",
    "color",
    "hidden",
  ].includes(type);
}

class ShortcutRegistry {
  private registrations = new Map<symbol, StoredRegistration>();
  private scopes: ActiveScope[] = [{ name: DEFAULT_SCOPE, compose: true }];
  private nextOrder = 0;
  private alive = true;
  private listener: ((event: KeyboardEvent) => void) | undefined;

  constructor(
    readonly platform: ShortcutPlatform,
    private onError?: (error: unknown, context: ShortcutRegistryContext) => void
  ) {}

  attach() {
    this.alive = true;
    if (typeof window === "undefined" || this.listener) {
      return;
    }
    this.listener = (event) => this.dispatch(event);
    window.addEventListener("keydown", this.listener);
  }

  teardown() {
    this.alive = false;
    this.registrations.clear();
    this.scopes = [{ name: DEFAULT_SCOPE, compose: true }];
    this.nextOrder = 0;
    if (this.listener) {
      window.removeEventListener("keydown", this.listener);
      this.listener = undefined;
    }
  }

  register(registration: ShortcutRegistration): () => void {
    const chord = canonicalizeShortcut(registration.shortcut, this.platform);
    const scope = registration.scope ?? DEFAULT_SCOPE;
    const stored: StoredRegistration = {
      chord,
      handler: registration.handler,
      scope,
      id: registration.id,
      priority: registration.priority ?? 0,
      exclusive: registration.exclusive ?? true,
      allowInInputs: registration.allowInInputs ?? false,
      repeat: registration.repeat ?? "ignore",
      preventDefault: registration.preventDefault ?? false,
      order: this.nextOrder++,
    };

    const replaced: symbol[] = [];
    if (stored.id) {
      for (const [key, existing] of this.registrations) {
        if (existing.id === stored.id) {
          replaced.push(key);
        }
      }
    }

    for (const [key, existing] of this.registrations) {
      if (replaced.includes(key)) {
        continue;
      }
      if (
        existing.chord === stored.chord &&
        existing.scope === stored.scope &&
        existing.priority === stored.priority
      ) {
        throw new ShortcutConflictError(stored.chord, stored.scope);
      }
    }

    for (const key of replaced) {
      this.registrations.delete(key);
    }

    const key = Symbol(stored.id ?? stored.chord);
    this.registrations.set(key, stored);

    let undone = false;
    return () => {
      if (undone) {
        return;
      }
      undone = true;
      this.registrations.delete(key);
    };
  }

  activateScope(name: string, options: ShortcutScopeOptions = {}): () => void {
    const entry: ActiveScope = {
      name,
      compose: options.compose ?? false,
    };
    this.scopes.push(entry);
    let undone = false;
    return () => {
      if (undone) {
        return;
      }
      undone = true;
      const index = this.scopes.lastIndexOf(entry);
      if (index >= 0) {
        this.scopes.splice(index, 1);
      }
    };
  }

  private eligibleScopes(): string[] {
    const eligible: string[] = [];
    for (let index = this.scopes.length - 1; index >= 0; index -= 1) {
      const scope = this.scopes[index];
      eligible.push(scope.name);
      if (!scope.compose) {
        break;
      }
    }
    return eligible;
  }

  private dispatch(event: KeyboardEvent) {
    if (!this.alive) {
      return;
    }

    const chord = chordFromEvent(event, this.platform);
    if (!chord) {
      return;
    }

    const editable = isEditableTarget(event.target);
    const eligible = this.eligibleScopes();
    const matches = [...this.registrations.values()]
      .filter((registration) => {
        if (registration.chord !== chord) {
          return false;
        }
        if (!eligible.includes(registration.scope)) {
          return false;
        }
        if (event.repeat && registration.repeat !== "allow") {
          return false;
        }
        if (editable && !registration.allowInInputs) {
          return false;
        }
        return true;
      })
      .sort((left, right) => {
        if (left.priority !== right.priority) {
          return right.priority - left.priority;
        }
        const leftSpecificity = eligible.indexOf(left.scope);
        const rightSpecificity = eligible.indexOf(right.scope);
        if (leftSpecificity !== rightSpecificity) {
          return leftSpecificity - rightSpecificity;
        }
        return right.order - left.order;
      });

    for (const registration of matches) {
      if (registration.preventDefault) {
        event.preventDefault();
      }

      const context: ShortcutRegistryContext = {
        scope: registration.scope,
        id: registration.id,
      };
      const normalized: NormalizedShortcutEvent = {
        chord,
        key: event.key,
        code: event.code,
        repeat: event.repeat,
        nativeEvent: event,
      };

      try {
        registration.handler(normalized, context);
      } catch (error) {
        this.onError?.(error, context);
      }

      if (registration.exclusive) {
        break;
      }
    }
  }
}

const registryStack: ShortcutRegistry[] = [];

function currentRegistry(): ShortcutRegistry {
  const registry = registryStack[registryStack.length - 1];
  if (!registry) {
    throw new Error(
      "registerShortcut() requires a ShortcutRegistryProvider ancestor."
    );
  }
  return registry;
}

export function registerShortcut(
  registration: ShortcutRegistration
): () => void {
  return currentRegistry().register(registration);
}

const ShortcutRegistryReactContext = createContext<ShortcutRegistry | null>(
  null
);

export function ShortcutRegistryProvider({
  children,
  platform,
  onError,
}: {
  children: ReactNode;
  platform?: ShortcutPlatform;
  onError?: (error: unknown, context: ShortcutRegistryContext) => void;
}) {
  const resolvedPlatform = platform ?? detectShortcutPlatform();
  const registry = useMemo(
    () => new ShortcutRegistry(resolvedPlatform, onError),
    [resolvedPlatform, onError]
  );

  if (!registryStack.includes(registry)) {
    registryStack.push(registry);
  }

  useEffect(() => {
    registry.attach();
    return () => {
      registry.teardown();
      const index = registryStack.lastIndexOf(registry);
      if (index >= 0) {
        registryStack.splice(index, 1);
      }
    };
  }, [registry]);

  return (
    <ShortcutRegistryReactContext.Provider value={registry}>
      {children}
    </ShortcutRegistryReactContext.Provider>
  );
}

function useRegistry(): ShortcutRegistry {
  const registry = useContext(ShortcutRegistryReactContext);
  if (!registry) {
    throw new Error(
      "Shortcut hooks require a ShortcutRegistryProvider ancestor."
    );
  }
  return registry;
}

export function useShortcut(registration: ShortcutRegistration) {
  const registry = useRegistry();
  const {
    shortcut,
    handler,
    scope,
    id,
    priority,
    exclusive,
    allowInInputs,
    repeat,
    preventDefault,
  } = registration;

  useEffect(
    () =>
      registry.register({
        shortcut,
        handler,
        scope,
        id,
        priority,
        exclusive,
        allowInInputs,
        repeat,
        preventDefault,
      }),
    [
      registry,
      shortcut,
      handler,
      scope,
      id,
      priority,
      exclusive,
      allowInInputs,
      repeat,
      preventDefault,
    ]
  );
}

export function useShortcutScope(
  name: string,
  options: ShortcutScopeOptions = {}
) {
  const registry = useRegistry();
  const compose = options.compose ?? false;
  useEffect(
    () => registry.activateScope(name, { compose }),
    [registry, name, compose]
  );
}
