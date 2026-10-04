---
name: SlatePOS Workspace
description: Implemented shadcn-svelte restaurant workspace; user acceptance pending.
colors:
  background: "#ffffff"
  foreground: "#18181b"
  card: "#ffffff"
  card-foreground: "#18181b"
  popover: "#ffffff"
  popover-foreground: "#18181b"
  primary: "#18181b"
  primary-foreground: "#fafafa"
  secondary: "#f4f4f5"
  secondary-foreground: "#27272a"
  muted: "#f4f4f5"
  muted-foreground: "#71717a"
  accent: "#f4f4f5"
  accent-foreground: "#18181b"
  destructive: "#b91c1c"
  border: "#e4e4e7"
  input: "#d4d4d8"
  ring: "#a1a1aa"
  brass: "#c2410c"
  brass-hi: "#ea580c"
  brass-ink: "#c2410c"
  brass-wash: "#fff1e8"
  brass-line: "#fed7bd"
  herb: "#35603f"
  herb-wash: "#e6efe6"
  herb-line: "#bdd2bf"
  amber: "#8a5a12"
  amber-wash: "#f7eeda"
  amber-line: "#e6d3a8"
  brick: "#9c3125"
  brick-wash: "#f8e7e3"
  brick-line: "#e8c2b8"
  slate: "#33506c"
  slate-wash: "#e6eef5"
  slate-line: "#c1d3e2"
typography:
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 640
    lineHeight: "1.2"
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.45"
    letterSpacing: "normal"
  control:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.25rem"
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "1.45"
    letterSpacing: "0"
  figure:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(24px, 2.4vw, 32px)"
    fontWeight: 600
    lineHeight: "1.1"
    letterSpacing: "-0.03em"
rounded:
  control: "8px"
  compatibility: "6px"
  panel: "8px"
  checkout: "10px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "14": "56px"
  "18": "72px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.control}"
    height: "36px"
    padding: "0 10px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
  input:
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    height: "36px"
    padding: "4px 10px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.panel}"
---
# Design System: SlatePOS Workspace

## Overview

**Creative North Star: "SlatePOS Workspace"**

SlatePOS Workspace uses the official shadcn-svelte Nova neutral components with self-hosted Inter, neutral primary actions, compact navigation, and bordered working surfaces. The menu keeps photography; drawers and menus carry real keyboard and focus behavior through Bits UI.

This is an implemented, reviewable source snapshot. User acceptance is pending: the user rejected Counter and Service and explicitly requested shadcn-svelte dropdowns, sheets, and a proper design system. This document describes the resulting code, not platform completeness or production readiness.

**Key Characteristics:**
- Neutral primary actions and restrained operational color.
- Inter typography and comparable tabular figures.
- Official shadcn-svelte controls with Bits UI interaction.
- Sheets for extended work and dialogs for bounded confirmation.

## Colors

The canonical neutral primitives live in `apps/admin/src/lib/styles/shadcn.css`; the frontmatter records their light values. The sidecar records dark overrides. Compatibility tokens map existing feature surfaces to the same primitives.

### Primary
- **Primary / Primary foreground:** near-black actions with light text; dark mode reverses their contrast. Orange is not the shared primary action.

### Tertiary
- **Operational orange:** the legacy `brass` family remains for limited POS photo quantity/add feedback and selected operational marks.
- **Herb / Amber / Brick / Slate:** semantic status text, wash, and borders; always accompanied by a status word.
- **Destructive:** generated controls' destructive semantics, distinct from legacy Brick status roles.

### Neutral
- **Background / Foreground:** working canvas and principal text.
- **Card / Popover:** panels and elevated menus.
- **Secondary / Muted / Accent:** controls, supporting bands, and hovered or selected rows.
- **Border / Input / Ring:** surface edges, field strokes, and focus feedback.

**The Neutral Actions Rule.** Shared primary controls use Primary; orange remains a local operational signal.

## Typography

**Body and heading font:** self-hosted Inter with UI sans fallbacks. **Identifier font:** JetBrains Mono with monospace fallbacks. The frontmatter records observed headline, body, control, label, and metric roles. Global H2 is 23px and H3 is 19px; generated inputs use 16px text below the medium breakpoint and 14px above it. Supporting rail labels and badges use 11px. Labels describe controls; they do not decorate headings.

**The Comparable Numbers Rule.** Money, quantities, and time use tabular figures; identifiers and keyboard hints may use mono.

## Layout

Desktop navigation is 216px wide, 76px when collapsed, with a 56px topbar. Navigation becomes a 280px left Sheet below the 1024px desktop breakpoint. The main scrolling area retains a centered 1600px maximum width and 16px/24px responsive horizontal padding. The topbar holds page identity, command search, branch Select, connection state, theme control, and account Dropdown Menu; less essential controls hide at smaller widths.

POS has a fluid menu and sticky 350px checkout at 1100px with 24px gap. Menu columns progress from two to three at 1320px and four at 1680px; list mode uses horizontal cards. On smaller screens checkout opens directly in a Sheet from the viewport-aware bottom shortcut, including after resizing from desktop. The shared generated controls follow a 36px minimum; compact icon controls use 32px. Cashier interactions expand to 44px on coarse pointers; the mobile checkout Sheet also uses a 44px minimum button rule. Compact desktop controls remain smaller.

## Elevation & Depth

Working panels remain flat and bordered. Dropdown, Select, and Popover use a soft two-part shadow (`0 4px 20px #00000012, 0 1px 3px #00000008`). Generated Sheet and Dialog use overlay depth and a dark scrim. Menu hover retains a shallow lift. State transitions come from the generated components and shared motion tokens; reduced motion collapses both legacy and data-slot animations. Legacy shadow tokens remain available but do not define resting-panel elevation.

**The Working Plane Rule.** Borders separate working surfaces; overlays and floating menus earn depth.

## Shapes

Generated controls use 8px corners. Compatibility fields and filter chips retain 6px corners; ordinary panels use 8px and checkout uses 10px. Photos and thumbnails use local rounded corners; avatars and photo counters are circular. The previous punched receipt geometry is disabled. Shape differences in retained feature components are migration evidence, not permission to invent a new scale.

## Components

### Buttons
Official generated Button owns neutral default, outline, secondary, ghost, destructive, and link variants. Shared Button maps existing feature APIs onto these variants and uses 44px for its large action. Default control padding is 10px horizontally with 14px medium text; icons are generally 16px. Focus uses Ring border and a 3px half-opacity ring. Disabled controls remove pointer interaction and use half opacity. Non-popup active buttons translate down one pixel. Destructive actions use a tinted fill and destructive text.

### Inputs / Fields
Generated Input uses Input stroke, transparent light fill, muted placeholder, 8px corners, 10px horizontal padding, and Ring focus. Invalid state changes border and ring to Destructive. Field wrappers connect Label, help/error text, and the control's accessibility attributes. SelectField uses the actual generated Select with selectable items and disabled-item semantics, rather than a native select styled to resemble a popover.

### Navigation and menus
The rail uses compact icon-and-label links, neutral selected rows, a workspace Dropdown Menu, and mobile navigation Sheet. Account actions use Dropdown Menu; branch switching uses Select. Command search uses the generated Command primitives in an overlay. Keep the underlying keyboard selection, Escape behavior, focus return, and accessible names when extending these components.

### Cards, tabs, and badges
Working panels and metric cards retain shared panel wrappers and tabular values. POS categories use generated Tabs with the line variant, keeping selection and keyboard behavior. Stamp wraps generated Badge: 24px height, 11px medium sentence-case text, optional 6px dot, and semantic status colors. Existing feature filters remain compatibility chips with compact rectangular corners.

### Sheets and dialogs
The shared Modal exposes explicit `presentation`. Extended forms and payment flows opt into Sheet; navigation and mobile cart also use Sheet. Bounded confirmations use Dialog. The wrapper still defaults to Dialog, so callers must select Sheet deliberately. Sheet forms default to a 520px maximum, capped to the viewport, with a scrollable body and optional footer. Confirmation Dialog caps its width to viewport minus 32px and body to 65dvh. Titles and descriptions remain present, with redundant descriptions visually hidden. Generated primitives own portals, focus containment, Escape, and focus restoration.

### Photo menu and checkout
Menu photography, name, detail, tabular price, and add/quantity feedback stay inside bordered photo cards. Checkout exposes line thumbnails, quantity edits, totals, and the neutral payment action. Mobile checkout uses a scrolling Sheet with a sticky action footer; nested checkout loses its extra border and rounded corners. Demo fallback images remain illustrative and restricted to demo data.

## Do's and Don'ts

### Do:
- **Do** use generated shadcn-svelte components and existing wrappers.
- **Do** pair every semantic theme role with its dark value.
- **Do** preserve control labels, focus management, and keyboard operation.
- **Do** set comparable money, quantity, and time in tabular figures.
- **Do** retain reduced-motion behavior and explicit status words.

### Don't:
- **Don't** reintroduce Counter receipt perforations or Service orange primary buttons.
- **Don't** replace a dropdown or sheet with a painted imitation.
- **Don't** use color as the only status signal.
- **Don't** interpret this visual snapshot as whole-platform production readiness.
