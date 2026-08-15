# AGENTS.md

Development rules for the chiaotu frontend SPA (Vite + React + TypeScript + TailwindCSS 4).
Rules are appended at the end with an incrementing number; existing rules are never renumbered or reordered.

## Development Rules

### 1. Styling: TailwindCSS only, responsive, mobile-first

- **Tailwind is the single source of styling**: all styles are written as Tailwind utility classes on JSX `className`. Do not introduce other styling approaches (CSS Modules, CSS-in-JS, component-library style systems), and do not hand-write custom CSS in `index.css` — it keeps only the single `@import "tailwindcss"` line.
- **Mobile-first**: write unprefixed mobile styles as the default, then layer enhancements with `sm:` / `md:` / `lg:` prefixes. Never build the desktop layout first and adapt it to mobile afterwards.
- **Breakpoint semantics**: mobile = unprefixed default styles; `sm:` ≥640px, `md:` ≥768px, `lg:` ≥1024px.
- **Acceptance baseline**: 375px (mainstream small phones) is the mobile acceptance width — no horizontal scrolling, no overflowing content, primary actions reachable with one hand (touch targets ≥44px). Any UI change must pass self-checks at both 375px and ≥1024px.
