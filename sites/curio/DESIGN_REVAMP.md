# Curio Revamp — Design Specification (v2)

> Preserve the soul: **capture a thought → research builds itself → read the whole story.**  
> Everything below keeps existing functionality (capture, library, topic detail, Wikipedia "whole story" reader, discover feed, import/export, guest/server modes) and re-skins + re-flows it.

---

## 1. North star & principles

- **Thought-first.** Capture is always one keystroke away (`/`). The home screen is a composer, not a dashboard.
- **Calm density.** Reading surfaces are airy; management surfaces are compact but never cramped.
- **Warm, not cold.** Curio should feel like a well-lit desk and a favorite book, not a SaaS admin panel.
- **Progressive disclosure.** Show the overview first; the full story, threads, sources, and notes are one tap away.
- **Keyboard-native.** Every primary action has a shortcut; mouse is optional.
- **Accessible by default.** WCAG 2.2 AA, reduced motion, screen-reader friendly, 44px touch targets.
- **No new dependencies.** Still zero-build, zero-deps; Google Fonts only.

---

## 2. Brand & visual system

**Name/voice:** Curio. Tagline: *"Never lose a thought worth exploring."*  
Voice: warm, curious, lightly literary, never cute or corporate. Microcopy uses sentence case and lowercase hints ("no pressure — just wonder").

**Brand mark:** Italic serif **C** inside a rounded square, but refined:
- Squircle (radius 14px at 40px) with a subtle inner highlight.
- Gradient from violet `#8E7CFF` → indigo `#5B4FD6`, plus a small amber spark (✦) in the top-right corner to signal "researched."
- Favicon and app icon use the same mark; maskable variant provided.

**Motif:** "The thread" — a thin amber line that appears as progress, dividers in reading mode, and the timeline spine. It visually ties capture → research → story.

**Iconography:** One consistent set (Lucide-style, 1.5px stroke, 20px). Replace emoji glyphs in nav with real icons. Keep emoji only in empty-state illustrations.

---

## 3. Color system

Dark-first ("Night Desk"), with an optional light ("Day Desk") and three **reading themes** (Dark / Light / Sepia). Tokens are CSS variables; components reference tokens only.

### Night Desk (default)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0D0C12` | App background |
| `--bg-elev` | `#14121B` | Elevated bands |
| `--surface` | `#1B1824` | Cards, panels |
| `--surface-2` | `#231F2E` | Hover/raised surfaces |
| `--surface-3` | `#2C2738` | Inputs, chips |
| `--line` | `rgba(244,239,228,.08)` | Borders |
| `--line-strong` | `rgba(244,239,228,.14)` | Emphasized borders |
| `--ink` | `#F4EFE4` | Primary text (warm ivory) |
| `--muted` | `#B6B0C4` | Secondary text |
| `--faint` | `#7A748A` | Tertiary text |
| `--accent` (violet) | `#8E7CFF` | Links, focus, progress |
| `--accent-soft` | `rgba(142,124,255,.14)` | Accent fills |
| `--spark` (amber) | `#F0B35A` | Primary CTA, capture |
| `--spark-soft` | `rgba(240,179,90,.14)` | Spark fills |
| `--blue` | `#7AA7FF` | Exploring status |
| `--green` | `#7FD6A0` | Completed status |
| `--rose` | `#F096A8` | Danger |
| `--amber` | `#F0B35A` | Unread status |

### Day Desk (light)

| Token | Value |
|---|---|
| `--bg` | `#F7F3EA` |
| `--surface` | `#FFFFFF` |
| `--surface-2` | `#F1ECE0` |
| `--line` | `rgba(20,18,28,.08)` |
| `--ink` | `#1A1722` |
| `--muted` | `#5C566B` |
| `--faint` | `#8A8499` |
| `--accent` | `#6B5CE6` |
| `--spark` | `#C9892E` |

### Reading themes

Applied via `data-reading-theme` on the reader root: `dark` (default Night Desk), `light`, `sepia` (`#F4ECD8` bg / `#3B2F1E` ink). Reading theme is independent of app theme.

### Contrast

All text/background pairs meet WCAG AA (4.5:1 body, 3:1 large). Status colors are never the only signal — always paired with text + icon.

---

## 4. Typography

**Families (Google Fonts):**
- Display / reading headings: **Fraunces** (variable, opsz 9–144) — keep, lean into optical sizing.
- UI / body: **Inter** (variable) — keep.
- Metadata / shortcuts / code: **JetBrains Mono** (new) for kbd, counts, timestamps.

**Type scale (rem, base 16px):**

| Token | Size | Use |
|---|---|---|
| `--t-xs` | 0.75 | Captions, counts |
| `--t-sm` | 0.8125 | Hints, meta |
| `--t-md` | 0.9375 | UI labels |
| `--t-base` | 1 | Body UI |
| `--t-lg` | 1.125 | Card titles |
| `--t-xl` | 1.25 | Section heads |
| `--t-2xl` | 1.5 | Page titles |
| `--t-3xl` | 2 | Hero |
| `--t-display` | clamp(2.25rem, 5vw, 3.5rem) | Home hero |

**Reading typography:** Fraunces 1.125rem, line-height 1.78, max-width 68ch, letter-spacing -0.005em. Drop cap on first paragraph of the lead section (optional, disabled in reduced motion). Paragraph spacing 1.1em.

**Font loading:** `font-display: swap`; preconnect already present; add `&display=swap`.

---

## 5. Layout & responsive

**App shell (desktop ≥ 1024px):**
```
┌──────────────────────────────────────────────────────┐
│  Skip link                                           │
├────────┬──────────────────────────────┬──────────────┤
│ Rail   │ Main (max 1200px)            │ (optional)   │
│ 220px  │ padding 40px                 │ inspector    │
│        │                              │ 320px        │
└────────┴──────────────────────────────┴──────────────┘
```
- Left rail: collapsible to 64px (icon-only) with tooltips; state persisted.
- Main: centered, max 1200px, 40px horizontal padding, 120px bottom padding for mobile nav safety on small screens (none on desktop).
- Reading view uses its own two-column layout (text + rail) inside main.

**Tablet (768–1023px):** rail collapses to 64px by default; inspector moves below content.

**Mobile (< 768px):** single column, 16px padding, bottom nav fixed with safe-area insets. Cards full width. Reading rail becomes collapsible accordions below the article.

**Spacing scale:** 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 (px). Use tokens `--s-1`…`--s-10`.

**Radii:** `--r-sm 10`, `--r-md 14`, `--r-lg 20`, `--r-xl 28`, `--r-pill 999`.

**Shadows:** two layers — `--sh-sm` (card), `--sh-md` (floating), `--sh-lg` (modal). Dark mode uses darker, softer shadows; light mode slightly stronger.

---

## 6. Navigation & information architecture

**Primary nav (4 items, down from 6):**
1. **Capture** (home) — ✦
2. **Library** — 📚 (with count badge)
3. **Discover** — ✧
4. **More** (menu: Settings, Import/Export, Theme, Help, About)

Status filters (Inbox / Exploring / Completed / Archived) become **chips inside Library**, not top-level routes. Deep links `#/library?status=exploring` still work; old routes (`#/inbox` etc.) redirect to the filtered library for compatibility.

**Left rail (desktop):**
```
[mark] Curio
       Night Desk

✦  Capture
▤  Library        (12)
✧  Discover

───
⚙  Settings
?  Help
```
Active item: filled pill background + left accent bar (3px). Badge shows unread count only when > 0.

**Bottom nav (mobile):** Capture, Library, Discover, More. Plus a **floating "Capture" FAB** on Library/Discover screens (bottom-right, 56px) that opens the composer modal — so capture is always one tap away even when scrolled.

**Breadcrumbs:** Topic detail shows `Library / {title}` (truncated) with back arrow; clicking Library returns to previous filter.

---

## 7. Core flows

### 7.1 Capture (home)

- Hero: "What's on your mind?" with italic emphasis.
- Composer card: textarea (auto-grows, 2–6 rows), row below with:
  - Left: detected input kind pill ("Question" / "Topic" / "Link") updating as you type.
  - Right: primary button "Explore ✦" (spark amber).
- Example chips below ("Try: …") — horizontal scroll on mobile.
- Status line (aria-live) shows researching progress: "Saving…" → "Researching…" → "Found it."
- Below: **Continue reading** strip (if any), **Resurfacing** strip, **Recent** grid (6).

**Micro:** on submit, button morphs to spinner; textarea disables; on success, navigate to topic with a 120ms fade; the new topic card in "Recent" is highlighted briefly.

### 7.2 Library

- Page head: title + count + Import/Export.
- Toolbar: search (with `/` hint), status chips, category select, sort, view toggle, archived toggle.
- Grid/list of cards. Empty state with CTA.
- Capture composer repeated at bottom ("Capture another") for flow.

**New:** bulk-ish actions via card hover; swipe on mobile (left = archive, right = complete) with haptic.

### 7.3 Topic detail

- Back link + breadcrumb.
- Hero card: category · type · read time; title; saved/updated dates; links (Wikipedia, Simple Wikipedia); progress steps (unread → exploring → completed) as a segmented control; action row (Copy summary, Rename, Archive, Delete).
- **Reading surface** (if story open) appears first and spans full width; otherwise the "Open the full story" panel sits in the prose column.
- Prose column: Overview (with Full/Plain English toggle), Key facts, Sources, Rabbit holes.
- Side column: Your take (notes, autosave), Details (dl).
- Mobile: side column stacks below; notes become a sticky bottom sheet? Keep stacked for simplicity, notes last.

### 7.4 Reading mode ("The whole story")

- Sticky top bar: read time remaining, word count, section count, progress bar (2px amber→violet gradient), buttons: "Start reading", "Focus mode", "Refresh", "Close", "Settings (Aa)".
- Two columns: main text (max 68ch) with TOC card above; right rail (timeline, filed under) sticky.
- Sections numbered, generous spacing, in-article anchor links.
- Below article: Threads, Reported elsewhere, Keep digging, source attribution.
- **Reading settings popover:** font size (S/M/L), measure (narrow/normal/wide), theme (Dark/Light/Sepia), focus mode toggle. Persisted in prefs.
- Progress persists per topic (scroll position) in localStorage; "Continue reading" resumes.

### 7.5 Discover

- Head with "Surprise me ✦".
- Three columns: Go deeper, Unexpected connections, Try something new.
- Cards show title + reason (italic). Clicking captures and navigates.

---

## 8. Components

- **Button:** variants primary (spark), secondary (surface), ghost, danger, icon. Sizes sm/md/lg. Focus ring. Disabled shows spinner for async.
- **Card:** surface bg, 1px line, radius lg, hover lift 2px + border strengthen. Actions fade in on hover (always visible on touch).
- **Pill:** status pills with icon + text; filter chips with check.
- **Input/Search:** 40px height, surface-3 bg, focus border accent + 3px soft ring.
- **Modal:** centered, max 480px, scale-in 160ms, backdrop blur. Focus trap, ESC close, click-outside close.
- **Toast:** bottom-center, slide up, auto-dismiss 3.2s, pause on hover.
- **Skeleton:** shimmer gradient.
- **Empty state:** centered, large muted glyph (Fraunces 56px), one-line message, optional CTA row.
- **Progress steps:** segmented control with done/now states; clicking sets status with confirmation toast.

---

## 9. Motion & micro-interactions

**Tokens:**
- `--dur-fast 120ms`, `--dur-base 200ms`, `--dur-slow 320ms`
- `--ease-out cubic-bezier(.16,1,.3,1)`, `--ease-in-out cubic-bezier(.4,0,.2,1)`

**Rules:**
- Page transitions: opacity 0→1 + 8px translateY, 160ms ease-out.
- Card hover: transform 200ms; no layout shift.
- Modal: backdrop fade 160ms, panel scale 0.96→1 + fade.
- Toast: slide + fade.
- Reading progress: 100ms linear width (already smooth).
- Reduced motion: disable transforms/parallax; keep opacity fades only (or none).

**Delightful details:**
- Completing a topic: checkmark scales in with a tiny confetti burst (3 particles, amber/violet/green), toast "Marked completed." Disabled under reduced motion.
- Capture success: composer button briefly shows "Found it ✓" before navigation.
- Empty library: the ✦ glyph gently floats (2s ease-in-out loop).
- Resurfacing cards: subtle 1.5s glow pulse once on view.
- Focus mode: chrome fades out; moving mouse brings it back.
- Reading finish: when progress hits 100%, "Finished" text + a soft chime (muted by default, toggle in settings).

---

## 10. Empty states & onboarding

**Empty states:**
- Library empty: "Your curiosity is waiting." + "Capture anything — we'll research it." + example chips + "Capture your first curiosity" button.
- Inbox empty: "Nothing waiting. Nice." + "New captures land here until you triage them."
- Exploring empty: "Nothing in progress." + "Open a topic's full story to start exploring."
- Completed empty: "No finished stories yet." + "Mark a topic completed when you're done with it."
- Search no results: "No matches." + "Try a broader term or clear filters."
- Discover empty (guest, no topics): starter picks with "Save a few topics to personalize."

**Onboarding (first run, guest or new user):**
1. Welcome modal: "Curio turns a half-formed thought into a researched story." 3 bullets: Capture, Read, Track. CTA "Capture your first curiosity" (pre-fills example? no — focus composer) + "Skip".
2. After first capture: coachmark pointing at "Open the full story": "This is where it gets good."
3. After opening story: coachmark on progress steps: "Track your journey."
4. Coachmarks dismissible and stored (`curio_onboarded_v1`); "Replay tour" in More menu.

**Guest mode:** persistent but quiet badge in composer ("Saved on this device"). Settings explains export/import backup. No nag modals.

---

## 11. Accessibility

- **Landmarks:** `header`, `nav`, `main`, `aside`, `footer`; skip-to-content link first in DOM.
- **Focus:** visible 2px ring (`--accent`) with 2px offset on all interactive elements; never remove outline without replacement.
- **Keyboard:** see §12.
- **Screen readers:** `aria-live="polite"` on status line and toast; `aria-current="page"` on active nav; modal `role="dialog" aria-modal="true"` with focus trap; card `role="link"` with Enter handling.
- **Color:** never color-only; status pills include text + icon.
- **Touch:** 44×44px minimum targets; bottom nav items 44px.
- **Motion:** honor `prefers-reduced-motion: reduce`.
- **Forms:** labels (visible or `aria-label`), `autocomplete`, error messages associated via `aria-describedby`.
- **Reading:** semantic `article`, headings in order, `lang` attribute, alt text for any images (none currently).
- **Contrast:** verified for all token pairs.

---

## 12. Keyboard shortcuts & command palette

**Global:**
- `/` — focus capture (home) or search (library) contextually.
- `Cmd/Ctrl+K` — open command palette.
- `?` — shortcut help modal.
- `g h` / `g l` / `g d` — go Home / Library / Discover (within 800ms).
- `n` — new capture (focus composer).
- `Esc` — close modal/palette; blur input.

**Library:**
- `j`/`k` — move selection through cards; `Enter` open.
- `e` — rename selected; `c` — mark completed; `a` — archive.
- `v` — toggle grid/list.

**Topic/reading:**
- `r` — open/close full story.
- `f` — focus mode toggle.
- `[` / `]` — previous/next section.
- `t` — jump to top of article.
- `s` — toggle reading settings.

**Command palette (Cmd/Ctrl+K):**
- Fuzzy search across: topics (by title/category), actions (new capture, import, export, theme toggle, focus mode, mark completed, archive, delete), navigation.
- Recent items section; keyboard navigable; Enter executes; Esc closes.
- Implementation: lightweight fuzzy match in JS (no deps), renders in a modal-like overlay with input + grouped results.

---

## 13. Bells & whistles

1. **Command palette** (§12).
2. **Reading settings + focus mode** (§7.4).
3. **Resume reading:** store scroll position per topic; "Continue reading" strip on home with progress %.
4. **Curiosity streak & stats:** days with a capture; total topics, words read, completed count. Small stats card in More menu. No gamification pressure ("streak" can be hidden).
5. **Random rabbit hole:** `r` on Discover or "Surprise me" picks a random topic/thread and captures it.
6. **Share:** "Copy link + summary" (copies title + overview + sources as Markdown). Print-friendly story view (`@media print`).
7. **Markdown notes:** optional Markdown preview toggle in notes panel (render with a tiny built-in renderer; no deps).
8. **Drag-and-drop import:** drop a `.json` backup anywhere on Library to import.
9. **Haptics:** `navigator.vibrate(10)` on mobile for complete/archive (respect reduced motion / settings).
10. **Optional sound:** soft chime on research complete and reading finish; off by default, toggle in settings.
11. **PWA:** manifest + service worker caching app shell and read stories for offline reading. "Add to Home Screen" prompt after 2nd visit.
12. **Share target:** PWA share target so sharing a link from another app captures it.
13. **Theme toggle:** system / dark / light, with smooth transition (disable transitions during theme swap to avoid flash).
14. **Reading progress ring** on topic cards in "Continue reading" strip.

---

## 14. Implementation & migration notes

- **Keep data model & routes.** No backend changes required; all enhancements are client-side. Old routes redirect.
- **CSS:** replace `:root` tokens; keep class names where possible to minimize JS churn, but rename layout classes (`side` → `rail`) gradually. Prefer a new `styles.css` with the token system; keep a compatibility shim for one release.
- **JS:** add modules (still one file is fine, but split into sections): `palette.js` (command palette), `reading.js`, `onboarding.js`. Keep `app.js` as entry.
- **Storage keys:** `curio_prefs_v2` (migrate v1), `curio_onboarded_v1`, `curio_reading_progress_v1`. Migrate prefs on boot.
- **Accessibility pass:** add skip link, focus trap util, shortcut help modal.
- **Testing:** run `node --check` on JS; manual smoke via existing playwright script; add a11y checks (axe) in smoke if available.
- **Deploy:** no changes to workflow; placeholders untouched (curio has no secrets).

---

## 15. Success metrics

- Time from landing to first capture < 10s (measure via analytics if added; otherwise heuristic).
- % of captures that open the full story ≥ 60%.
- Return visits to "Continue reading" ≥ 40% of sessions.
- Zero accessibility violations in axe audit on home, library, topic, reading views.
- Lighthouse: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95.

---

*End of spec.*