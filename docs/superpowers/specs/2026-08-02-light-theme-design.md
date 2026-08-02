# Light / Dark / System Theme Modes

## Status

Design (brainstorming phase). For implementation planning.

## Summary

The Traceability Electron app is currently dark-only. This spec adds **light, dark, and system-follow** theme modes, following shadcn's official theming pattern for Tailwind v4, adapted to this app's dark-first codebase. A sidebar toggle plus a command-palette ("主题") group switch modes; the choice persists in `localStorage`; native window chrome follows via Electron `nativeTheme`.

## Current state

- `app/src/renderer/index.css` declares the entire palette once, dark-only:
  - `@theme` maps custom palette tokens (`--color-canvas`, `--color-surface-1..3`, `--color-ink`, `--color-muted/subtle/tertiary`, `--color-primary[-hover]`, `--color-info/success/warning/danger`, `--color-hairline[-strong]`) to static dark hex values.
  - `@theme inline` maps shadcn semantic tokens (`--color-background`, `--color-card`, …) to `:root` CSS vars (`var(--background)` etc.).
  - `:root` defines the raw vars (`--background: #090a0c`, `--foreground: #f5f5f7`, `--card`, `--popover`, `--primary`, `--border`, `--input`, `--ring`, `--radius`, `--window-controls-left`).
- **Zero** `dark:` variant usage in the codebase. Components reference palette tokens directly (`bg-surface-1`, `text-ink`, `border-hairline`).
- **Verified in compiled CSS** (`out/renderer/assets/*.css`): utilities emit runtime `var()` references, not inlined hex, e.g. `.text-primary { color: var(--primary) }`, `.bg-surface-1 { background-color: var(--color-surface-1) }`. Overriding the variables in a theme block flips the whole UI.
- **~43 hardcoded hex/rgba** colors scattered across pages/components (e.g. `bg-[rgba(12,13,16,0.72)]`, `text-[#111329]`, `bg-white/[0.035]`, `text-[#090a0b]`).
- Persistence pattern: `localStorage` keys prefixed `traceability:` (see `context/current-project.tsx`).
- Native chrome: `BrowserWindow` uses `vibrancy: "under-window"`, transparent `backgroundColor`, `titleBarOverlay.symbolColor: "#f5f5f7"` (hardcoded dark). `nativeTheme` is not referenced anywhere yet.
- IPC: `shared/events-ipc.ts` centralizes the main→renderer event allowlist (`ALLOWED_MAIN_EXPOSE_EVENTS`) and the render→main invoke allowlist (`ALLOWED_RENDER_INVOKE_EVENTS`); `preload/index.ts` exposes typed `invoke`/`on` via `window.electronAPI`. New channels must be added to these allowlists.
- Commands: `useRegisterCommands` in `pages/(protected)/_layout.tsx` (`AppLayout`) registers global commands. Existing groups & sort order: Navigation(10), Monitor(10/20), Project(30), Agent(40), Current issue(50). `CommandPalette` renders groups via cmdk (`CommandGroup`).
- `index.html` has no inline theme script (no FOUC protection today).

## Requirements

1. Three modes: **light**, **dark**, **system** (follow OS). Dark remains the default so existing users see no change until they opt in.
2. Toggle UI in the **Sidebar bottom** (currently a status dot in `SidebarFooter`): a popover (DropdownMenu) with three items **Light / Dark / System**, active one marked. Icon reflects current resolved mode.
3. Command-palette entries under a **"主题"** group (label in Chinese), e.g. light/dark/system actions.
4. Persist the choice in `localStorage` (`traceability:theme`); restore on launch without flash (FOUC prevention).
5. `System` mode live-follows OS theme changes.
6. Native window chrome (titlebar overlay, vibrancy) follows the selected/resolved theme.
7. Every screen must remain legible in both themes; hardcoded dark colors are tokenized so they adapt.

## Design

### 1. Token architecture (shadcn `@custom-variant` + `.light`/`.dark`)

Follow shadcn's Tailwind v4 theming pattern, adapted to this dark-first app:

**1a. Dark variant.** Add to `index.css`:

```css
@import "tailwindcss";
@custom-variant dark (&:is(.dark *));
```

This makes `dark:` utilities available for any future exceptions; the ThemeProvider toggles the `dark` class on `<html>`.

**1b. Palette layout.** Dark values become the `.dark` block; light values become the `:root` default; `@theme`/`@theme inline` keep only the token-name mappings.

- `:root` (default) holds **light** values + `color-scheme: light`.
- `.dark` holds the **current dark** values + `color-scheme: dark` (byte-for-byte today's look).
- `@theme` (non-inline) declares token names with the **light** default values (dark overrides come from the `.dark` CSS-var block for the custom palette tokens, which utilities reference via `var(--color-*)`).
- `@theme inline` stays as the semantic map; both `:root` and `.dark` define the raw `--background`, `--surface-1`, etc. variables.

**1c. Light palette values** (mirror of the dark design, inverse luminance):

| Token | Dark (`.dark`, today) | Light (`:root`) |
|---|---|---|
| `--background` / `--canvas` | `#090a0c` | `#f6f6f7` |
| `--surface-1` | `#101115` | `#ffffff` |
| `--surface-2` | `#14151a` | `#fbfbfc` |
| `--surface-3` | `#1a1b21` | `#f1f1f3` |
| `--ink` | `#f5f5f7` | `#1a1a1f` |
| `--muted` | `#b6b7bc` | `#4a4b52` |
| `--subtle` | `#9a9ba3` | `#66676e` |
| `--tertiary` | `#808189` | `#7c7d85` |
| `--primary` | `#8f9cff` | `#5b67d4` |
| `--primary-hover` | `#aeb7ff` | `#4a55bd` |
| `--info` | `#6db9ff` | `#2f7bc9` |
| `--success` | `#58c77b` | `#2f9e54` |
| `--warning` | `#e4b55a` | `#a97b1c` |
| `--danger` | `#f17c7c` | `#cf3f3f` |
| `--hairline` | `rgba(255,255,255,0.08)` | `rgba(10,10,12,0.09)` |
| `--hairline-strong` | `rgba(255,255,255,0.14)` | `rgba(10,10,12,0.16)` |
| `--border` / `--input` | `rgba(255,255,255,0.08)` | `rgba(10,10,12,0.09)` |
| `--ring` | `#8f9cff` | `#5b67d4` |

Foregrounds pair to their light equivalents: `--primary-foreground` light `#ffffff` (dark `#111329`); `--foreground`, `--card-foreground`, `--popover-foreground`, `--secondary-foreground`, `--accent-foreground`, `--muted-foreground`, `--destructive-foreground` similarly inverted.

### 2. ThemeProvider + ModeToggle

**`app/src/renderer/context/theme.tsx`** — shadcn-style provider:

- `type Theme = "light" | "dark" | "system"`; `defaultTheme = "dark"`; `storageKey = "traceability:theme"`.
- `useState` seeded from `localStorage`; `setTheme` persists + applies.
- Effect toggles `document.documentElement.classList` (`light` / `dark`); `system` resolves via `window.matchMedia("(prefers-color-scheme: dark)")`.
- `useEffect` subscribes to `matchMedia` change events when in `system` mode → live OS following.
- Mounted in `App.tsx` outermost (above `ElectronIPCProvider`).

**`app/src/renderer/components/ModeToggle.tsx`** — placed in `SidebarFooter` (replacing/alongside the status dot):

- `DropdownMenu` trigger button (Sun / Moon / Monitor icon per current resolved state).
- Items: **Light / Dark / System**, active marked (reuse existing `DropdownMenu*` primitives).

**FOUC prevention** — inline `<script>` in `index.html` before `main.tsx`:

```html
<script>
  (function () {
    try {
      var t = localStorage.getItem("traceability:theme") || "dark";
      var d = t === "system"
        ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : t;
      document.documentElement.classList.add(d);
    } catch (e) {}
  })();
</script>
```

### 3. Command-palette commands — group "主题"

Add a new group and three commands, registered in `AppLayout` (`pages/(protected)/_layout.tsx`) alongside the existing `useRegisterCommands`, which can access `useTheme()`:

```ts
const { theme, setTheme } = useTheme();

useRegisterCommands(() => [
  { id: "theme.light",   group: { id: "theme", label: "主题", order: 60 }, title: "Light mode",        description: "Switch to light theme", icon: Sun,    action: () => setTheme("light") },
  { id: "theme.dark",    group: { id: "theme", label: "主题", order: 60 }, title: "Dark mode",         description: "Switch to dark theme",  icon: Moon,   action: () => setTheme("dark") },
  { id: "theme.system",  group: { id: "theme", label: "主题", order: 60 }, title: "System theme",      description: "Follow the OS theme",   icon: Monitor, action: () => setTheme("system") },
], [setTheme]);
```

- Group id `theme`, label `主题`, `order: 60` → renders after "Current issue" (50), last.
- `CommandPalette` needs no changes — it renders whatever `useRegisteredCommands()` provides.
- Titles stay **English** to match every other command in the app (`Go to Inbox`, `Refresh monitoring data`); only the group label is Chinese (`主题`) per requirement.

### 4. Native window chrome sync

**`shared/theme-ipc.ts`** — new contract:

```ts
export type ThemeSource = "light" | "dark" | "system";
export interface ThemeIPC {
  setThemeSource: (source: ThemeSource) => Promise<void>;
  getThemeSource: () => Promise<ThemeSource | null>; // null = never set
}
```

**`shared/events-ipc.ts`** — add:
- `ALLOWED_RENDER_INVOKE_EVENTS`: `"setThemeSource"`, `"getThemeSource"`.
- `AgentRuntimeIPC`: add `ThemeIPC`.
- `ALLOWED_MAIN_EXPOSE_EVENTS` + `AllowedMainExposeEvents`: new event `"native_theme_updated"` carrying `{ themeSource: ThemeSource; resolved: "light" | "dark" }` so System mode live-follows OS changes pushed from main.

**`main/`** — new `theme.ts` handler (or inline in `index.ts`):
- `setThemeSource` → `nativeTheme.themeSource = source`; persist `themeSource` to a small JSON file in `userData` (e.g. `theme-source.json`), read at startup before `createWindow` so native chrome is correct from first paint.
- `nativeTheme.on("updated")` → push `native_theme_updated` to the window.
- `titleBarOverlay.symbolColor` set from `nativeTheme.shouldUseDarkColors ? "#f5f5f7" : "#1a1a1f"`.

**`preload/index.ts`** — no new surface needed; the allowlisted channels flow through the existing `invoke`/`on` bridge.

### 5. Tokenize hardcoded colors (~43 sites)

New semantic tokens (both palettes) to replace hardcoded values so they adapt:

- `--color-surface-glass` — translucent elevated surfaces over vibrancy: Titlebar `bg-[rgba(12,13,16,0.72)]`, Sidebar `bg-[rgba(18,19,23,0.84)]`, AgentPanel `bg-[rgba(16,17,21,0.86)]`, panel footer `bg-[rgba(14,15,18,0.94)]`, dropdowns `bg-[rgba(28,29,35,0.96)]`, CommandPalette `bg-[rgba(31,32,38,0.9)]`.
- `--color-code-bg`, `--color-code-text`, `--color-code-line-number` — source/stacktrace code blocks (`#090a0b`, `#c7cbd3`, `#474b52`).
- `--color-primary-foreground` — `text-[#111329]` (on-primary).
- `--color-window-symbol` — titlebar overlay symbol color (native).
- `--color-breadcrumb-dim` or reuse `--color-subtle` — `text-[#55565d]`.
- `bg-white/[0.03|0.025|0.035|0.06|0.07]`, `bg-white/10`, `bg-white/[0.1]` — replace with `bg-surface-glass` / opacity-modulated tokens (`bg-primary/[0.09]` etc. already tokenized).
- Gradient/shadow hexes that are theme-agnostic (logo `#9ba7ff→#626fd2`, success-glow `rgba(88,199,123,0.1)`) stay as-is.

`color-scheme` follows the theme so native scrollbars/form controls match.

### 6. Edge cases

- Vibrancy `under-window` backdrop: `--color-surface-glass` provides a legible translucent layer in both themes.
- Source-code blocks keep a high-contrast canvas in both themes via `--color-code-bg` (dark value `#090a0b`, light value a near-white gray).
- `rrweb` replay iframe is intentionally dark in both themes (already `#090a0b`) — acceptable, leave it.
- Live OS theme change while in System mode re-themes via `matchMedia` listener + `nativeTheme` "updated" push.
- Existing users keep dark (default dark, persisted on first run via the FOUC script fallback).

### 7. Testing

- `pnpm typecheck` (both tsconfig projects), `pnpm test`, `pnpm build`.
- Manual: toggle all three modes; verify every page (Login, Inbox, Issues, Issue detail w/ stacktrace+source code, Sourcemaps, Explorer, Agent panel, modals/dropdowns/command palette); native titlebar + vibrancy flip; persistence across relaunch; System follows live OS change; no FOUC on launch; command palette "主题" group switches themes.

## Out of scope

- A full Settings page (toggle lives in sidebar + command palette).
- Custom theme creation / color editor.
- Re-theming the rrweb replay iframe content.
- Reverting the unrelated uncommitted working-tree changes in `app/src/extensions/...` and `app/src/main/tools/`.
