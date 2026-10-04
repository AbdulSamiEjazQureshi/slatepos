# SlatePOS admin

SvelteKit 3 / Svelte 5 workspace for the ROMS API. Run `bun run dev:admin` from the repository root; the API runs separately with `bun run dev:api`.

## Component system

Official shadcn-svelte Nova components live in `src/lib/components/ui`. `components.json` records generator configuration; run `bunx shadcn-svelte@latest add <component>` from this directory to extend it after verifying compatibility.

- `src/lib/styles/shadcn.css`: primitive colors, theme roles, and interaction targets.
- `src/lib/styles/tokens.css`: compatibility aliases and operating status colors.
- `src/lib/ui`: feature-facing adapters for buttons, labeled fields, selects, status badges, dialogs and sheets.
- Root `DESIGN.md`: typography, spacing, component policy and motion rules.

Forms use Input, Textarea and Select primitives. Use Dialog for short decisions, Sheet for longer contextual tasks. Navigation and mobile checkout use Sheets. Menus, selects, command search and sheets retain Bits UI focus and keyboard behavior. Generated components were adapted to the installed Bits UI `data-state` attributes and Svelte 5 attachments.

## Validation

`bun run check`, `bun run lint`, `bun run test`, and `bun run test:e2e` run frontend checks. E2E requires both development servers and the seeded demo tenant. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use an existing Chromium executable, or install Playwright's browser.

Production builds use adapter-node; see root `DEPLOYMENT.md`. Remaining platform release work is recorded in `READINESS.md`.
