# App Kit Registry

App Kit is a source-distributed shadcn registry of reusable infrastructure components for React applications, including Next.js applications and client-side SPAs.

## Language

**Registry item**:
One independently installable App Kit capability, distributed as source files through the shadcn CLI or copied manually.
_Avoid_: Package, library component

**Build contract**:
The complete implementation-facing specification for a registry item: its public API, installation surface, runtime boundaries, interoperability, error behaviour, and acceptance criteria.
_Avoid_: Initial spec, placeholder

**Shortcut registry**:
The App Kit capability that normalizes keyboard shortcuts, tracks registrations, resolves active conflicts, and dispatches matching handlers within named scopes.
_Avoid_: Key manager, hotkey manager

**Shortcut scope**:
An independently activatable namespace of shortcut registrations; nested scopes may be isolated or explicitly composed according to the contract.
_Avoid_: Context, keyboard context

**Command palette**:
The App Kit capability that lets applications register searchable commands and expose them through a global or embedded command surface.
_Avoid_: Command menu, launcher

**Palette scope**:
An independently searchable namespace of command registrations, used to decide which commands a palette host may display.
_Avoid_: Command context, command group

### Overlays

**Overlay layer**:
A registered sheet, modal, or blocking loading surface that participates in one foreground, focus, and escape protocol.
_Avoid_: Overlay host, dialog root

**Overlay composition protocol**:
The z-order, inertness, focus-ownership, escape, and suspend/resume rules among overlay layers. Modal and sheet stacks stay separate.
_Avoid_: Shared overlay manager

### Authentication

**Auth user**:
The provider-neutral identity exposed to an application after authentication. It is identified by a stable `id` and may include safe display fields and metadata.
_Avoid_: Account, provider user

**Session**:
The provider-neutral authenticated relationship between an auth user and an application, including its expiry information and optional session identifier.
_Avoid_: Token, credential

**Authentication adapter**:
The consumer-supplied boundary that connects Authentication Core to a concrete sign-in, sign-out, session, or token-exchange system.
_Avoid_: Auth backend, auth library

**Session seed**:
A serializable, secret-free initial session snapshot supplied by a server render to initialize client authentication state.
_Avoid_: Hydration token, client credential

**Sign-in failure**:
An expected unsuccessful `signIn` result whose payload is an `ErrorClassification`, not a parallel category union.
_Avoid_: Raw auth error, SignInFailure category list

**Pending action intent**:
A versioned, serializable, user-scoped description of an action that may resume after authentication, identified by an idempotency key and bounded by an expiry time.
_Avoid_: Pending callback, serialized function

**Pending-action handler**:
A runtime-registered function that validates and executes one kind of pending action intent after authentication.
_Avoid_: Intent payload, auth callback

**Mutation replay**:
The explicit post-auth re-execution of a state-changing pending action, governed by a consumer-owned idempotency strategy.
_Avoid_: Automatic retry

**Pending-action store**:
The injected persistence boundary that saves, reads, atomically claims, and removes pending action intents within a chosen scope.
_Avoid_: Auth cache, callback storage

**Resume operation**:
The bounded workflow that validates, claims, navigates to, and dispatches one pending action intent after authentication.
_Avoid_: Redirect callback

**Auth guard**:
A boundary that requires an authenticated session before allowing a protected route to render or a guarded action to execute.
_Avoid_: Authorization guard, login redirect

**Unauthenticated policy**:
The explicit auth-guard mode: `redirect-without-resume`, `redirect-and-resume`, or `inline`.
_Avoid_: Default redirect

**Guarded action**:
A consumer action wrapped with an auth guard that checks the current session before dispatch and may register an explicit pending action intent.
_Avoid_: Protected callback

**Protected route**:
A route whose content or entry is withheld until the required authentication state is established.
_Avoid_: Private page

**Refresh coordinator**:
The scoped capability that performs one authenticated session refresh at a time and shares its outcome with waiting requests.
_Avoid_: Token refresher, auth poller

**Request replay**:
The bounded re-execution of a request after a successful session refresh, permitted by the request's replay policy.
_Avoid_: Automatic retry

**Optimistic update**:
A temporary cache projection applied before a mutation result is known, with a defined success reconciliation and failure rollback.
_Avoid_: Predicted server state

**Cache snapshot**:
The immutable pre-mutation value captured for every explicitly targeted cache entry so one optimistic attempt can restore its prior state.
_Avoid_: Cache backup

**Rollback**:
The restoration of an optimistic mutation's captured cache snapshots after a failed or cancelled mutation attempt.
_Avoid_: Undo request

**Draft**:
A versioned, user-namespaced, locally or remotely persisted representation of incomplete consumer-owned input that can be restored without submitting it.
_Avoid_: Pending mutation, form submission

**Draft namespace**:
The storage scope derived from the authenticated user identity or the separate anonymous identity under which a draft may be read and written.
_Avoid_: Shared draft bucket

**Draft lifecycle**:
The explicit sequence of dirty, scheduled, saved, failed, flushed, restored, and discarded states for one draft identity and schema version.
_Avoid_: Autosave status

**Unsaved-changes guard**:
A boundary that protects dirty user work from browser unload or intercepted navigation until the user confirms leaving or the work becomes clean.
_Avoid_: Form guard, navigation blocker

**Dirty state**:
The consumer-owned indication that current user work differs from the last accepted clean baseline.
_Avoid_: Unsaved boolean inferred by the guard

**Navigation retry**:
The single guarded re-attempt of an originally requested navigation after the user confirms leaving.
_Avoid_: Redirect loop

**Feature flag**:
A provider-neutral, schema-declared boolean or finite variant value that controls consumer behavior through a safe default when unavailable or invalid.
_Avoid_: Remote config blob, experiment assignment

**Flag snapshot**:
A serializable, validated collection of feature-flag values evaluated for one request or client bootstrap.
_Avoid_: Provider response

**Flag schema**:
The consumer-declared type, allowed variants, and safe default for one feature flag key.
_Avoid_: Flag metadata

### Error handling

**Error category**:
A stable provider-neutral classification used to decide how an application should handle an error.
_Avoid_: HTTP error, exception name

**Error classification**:
A safe, structured description of an error category and its consumer-facing handling hints, without exposing the raw failure.
_Avoid_: Error payload, stack trace

**Error classifier**:
A pure mapping boundary that converts an unknown failure into an Error Classification and may defer to later mappings when it does not recognize the failure.
_Avoid_: Error handler, error reporter

### Connectivity

**Connectivity state**:
A provider-neutral public observation of reachability with one of `unknown`, `online`, or `offline`; probe execution may be checking internally but is not a public state.
_Avoid_: Network status, degraded state

**Reachability probe**:
An optional consumer-supplied, abortable operation used to verify that the application can reach a chosen resource; App Kit does not select its endpoint or backend.
_Avoid_: Ping endpoint, connectivity backend

**Offline banner**:
An accessible, non-blocking presentation of the current Connectivity state that reports offline truth without queuing or replaying consumer mutations.
_Avoid_: Offline queue, retry banner

### Session lifecycle

**Idle state**:
The public lifecycle of inactivity tracking: `active`, `warning`, or `timed-out`, with the terminal reason kept separate from authentication credentials.
_Avoid_: Session status, inactive boolean

**Session-timeout warning**:
An accessible confirmation workflow shown before an idle or session-expiry deadline, offering explicit continuation or sign-out without silently refreshing authentication.
_Avoid_: Auto logout dialog, refresh prompt

### Error reporting

**Reporting boundary**:
An explicit side-effect boundary that submits a safe Error Report through a consumer-supplied adapter after classification; it does not own classification or recovery.
_Avoid_: Error handler, telemetry singleton

**Error report**:
A bounded, redacted, provider-neutral record containing an Error Classification and explicitly allowlisted context for optional delivery to a reporting adapter.
_Avoid_: Raw exception payload, crash dump

**Report consent**:
The explicit consumer-controlled permission and disclosure step for sending an error report or optional user feedback; it is not inferred from boundary rendering.
_Avoid_: Automatic feedback capture
