# AGENTS.md

Development rules for the chiaotu project.
Rules are appended at the end with an incrementing number; existing rules are never renumbered or reordered.

## Project Background

**Chiaotu** originated as a **CLI tool** written in TypeScript (Node.js) for managing and generating proxy configurations for ClashMetaForAndroid and similar proxy clients. It processed multiple proxy sources, cached them, and generated unified proxy configurations with organized routing rules.

The project is **currently being transformed into a Web project** (frontend SPA with Vite + React + TypeScript + TailwindCSS 4). The original CLI codebase and architecture (command pattern, repository pattern, Zod validation, persistence layer) are being migrated and adapted for a web interface.

### Original CLI Architecture
- **CLI entry point**: `src/index.ts` with commands like `tu add <url|file>` and `tu generate`
- **Core modules**: commands (`add`, `generate`), persistence (configuration, store, file-utils), errors, utils
- **Proxy pipeline**: Download → Cache → Merge → Deduplicate → Organize (by region) → Filter → Generate
- **Persistence**: Configuration stored in `~/.config/chiaotu/` with presets, cache, templates, rules, results
- **Key dependencies**: `js-yaml`, `minimist`, `zod`, `tsx`, `@biomejs/biome`

## Important Notes

- **No README file**: This project intentionally does not have a README. Do not create one.

## Development Rules

### 1. Styling: TailwindCSS only, responsive, mobile-first

- **Tailwind is the single source of styling**: all styles are written as Tailwind utility classes on JSX `className`. Do not introduce other styling approaches (CSS Modules, CSS-in-JS, component-library style systems), and do not hand-write custom CSS in `index.css` — it keeps only the single `@import "tailwindcss"` line.
- **Mobile-first**: write unprefixed mobile styles as the default, then layer enhancements with `sm:` / `md:` / `lg:` prefixes. Never build the desktop layout first and adapt it to mobile afterwards.
- **Breakpoint semantics**: mobile = unprefixed default styles; `sm:` ≥640px, `md:` ≥768px, `lg:` ≥1024px.
- **Acceptance baseline**: 375px (mainstream small phones) is the mobile acceptance width — no horizontal scrolling, no overflowing content, primary actions reachable with one hand (touch targets ≥44px). Any UI change must pass self-checks at both 375px and ≥1024px.
