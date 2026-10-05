---
name: SlatePOS Evergreen
description: Evergreen restaurant workspace built on shadcn-svelte; user acceptance pending.
colors:
  background: '#ffffff'
  foreground: '#193b35'
  card: '#ffffff'
  card-foreground: '#193b35'
  popover: '#ffffff'
  popover-foreground: '#193b35'
  primary: '#166b59'
  primary-foreground: '#f8fcfb'
  secondary: '#f0f5f3'
  secondary-foreground: '#284a44'
  muted: '#f0f5f3'
  muted-foreground: '#64746f'
  accent: '#f0f5f3'
  accent-foreground: '#193b35'
  destructive: '#b91c1c'
  border: '#dfe8e4'
  input: '#c5d3cd'
  ring: '#25836f'
  brass: '#166b59'
  brass-hi: '#125745'
  brass-ink: '#166b59'
  brass-wash: '#e6f2ed'
  brass-line: '#b7d9ca'
  herb: '#35603f'
  herb-wash: '#e6efe6'
  herb-line: '#bdd2bf'
  amber: '#8a5a12'
  amber-wash: '#f7eeda'
  amber-line: '#e6d3a8'
  brick: '#9c3125'
  brick-wash: '#f8e7e3'
  brick-line: '#e8c2b8'
  slate: '#33506c'
  slate-wash: '#e6eef5'
  slate-line: '#c1d3e2'
  ground: '#f3f6f4'
  ink-2: '#50645d'
  ink-3: '#62746c'
  rail: '#163c36'
  rail-ink: '#eef7f2'
  rail-ink-2: '#b4cdc1'
  rail-workspace: '#21483f'
  rail-active: '#d4ecdf'
typography:
  headline:
    fontFamily: 'Archivo, ui-sans-serif, system-ui, sans-serif'
    fontSize: '28px'
    fontWeight: 600
    lineHeight: '1.2'
    letterSpacing: '-0.02em'
  body:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: '1.45'
    letterSpacing: 'normal'
  control:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 500
    lineHeight: '1.25rem'
    letterSpacing: 'normal'
  label:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '13px'
    fontWeight: 500
    lineHeight: '1.45'
    letterSpacing: '0'
  figure:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: 'clamp(24px, 2.4vw, 32px)'
    fontWeight: 600
    lineHeight: '1.1'
    letterSpacing: '-0.03em'
rounded:
  control: '8px'
  compatibility: '6px'
  panel: '14px'
  checkout: '16px'
spacing:
  '1': '4px'
  '2': '8px'
  '3': '12px'
  '4': '16px'
  '5': '20px'
  '6': '24px'
  '8': '32px'
  '10': '40px'
  '14': '56px'
  '18': '72px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    rounded: '{rounded.control}'
    height: '36px'
    padding: '0 10px'
  button-outline:
    backgroundColor: '{colors.background}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.control}'
  input:
    textColor: '{colors.foreground}'
    rounded: '{rounded.control}'
    height: '36px'
    padding: '4px 10px'
  card:
    backgroundColor: '{colors.card}'
    textColor: '{colors.card-foreground}'
    rounded: '{rounded.panel}'
---

## Overview

SlatePOS Evergreen gives restaurant staff a calm, readable workspace with a deep evergreen navigation rail and light work surfaces. The existing shadcn-svelte and Bits UI controls remain the interaction foundation. User acceptance of this redesign is pending.

**The Service First Rule.** Visual emphasis belongs to current work and primary actions. Real API data, permission checks, exact payment calculations, keyboard shortcuts, and realtime updates remain authoritative.

## Colors

Teal primary actions and mint selected navigation contrast with the evergreen rail. White content surfaces sit on a cool green-gray canvas. Semantic green, amber, red and slate continue to identify states with text. Dark mode uses green-tinted surfaces and pale mint actions.

Source order is `shadcn.css`, `tokens.css`, then `workspace.css`; the last file carries the Evergreen overrides.

## Typography

Self-hosted Archivo carries headings and dashboard figures. Self-hosted Inter carries body text, controls, and tabular numbers. JetBrains Mono is reserved for keyboard shortcuts and identifiers. Shared page headings are 28px; menu names are 15px, reduced to 13px. Supporting copy uses the existing 12–14px scale.

## Layout

A 64px global header holds identity, command search, branch selection and account controls. A 52px horizontal section switcher separates Service, Stock, Back office and System, filtered by permissions. The contextual sidebar shows only the selected section’s pages, at 208px or 64px collapsed. It becomes an all-sections Sheet below 1024px. Content uses a fluid container up to 1600px with 32px desktop and 16px mobile gutters. Shared page headings separate the title and primary action from the working surface.

The dashboard begins with compact figures and permission-filtered service shortcuts. Open orders and attention items lead the working area; sales history and popular dishes follow below. Figures form two columns on phones. DOM order matches reading and keyboard order.

POS splits into menu and a 360px checkout from 1100px. Search spans the menu area above browsing controls. At 1200px, categories become a persistent 128px vertical column beside products; the service sidebar narrows to 176px. The menu grows from two to three columns at 1560px, and four at 1920px. Phones retain two columns, horizontally scrollable categories, and a Sheet checkout. Branch selection remains available on phones.

Catalog separates view and status controls from category filters and the results table. Desktop category filters occupy a 180px column; below 768px they become a horizontal strip. The category-management view uses the full working width.

## Elevation & Depth

Work panels use subtle borders without shadows. Floating menus and dialogs retain their existing soft shadows. Product hover emphasizes the border; it does not move the layout.

## Shapes

Work panels and menu cards use 14px corners. Checkout uses 16px corners and a mint header. Control corners remain 6–8px. Menu add controls are circular; photography meets the card edge.

## Components

Navigation retains permission filtering, collapse controls, workspace settings, and mobile Sheet behavior. Search opens the existing command palette. Account controls, branch locking, and theme switching keep their existing behavior.

The metric strip uses one tinted sales segment; other segments remain quiet. Service shortcuts inherit navigation permission checks. POS uses real product photos and existing demo-only fallback photography. Checkout retains order types, customers, notes, hold/resume, tax calculation and payment flows.

Sign-in uses a centred split surface beneath a standalone brand header: an evergreen restaurant panel on the left and a focused sign-in form on the right. On phones the story panel disappears and the form fills the available width. Workspace switching is progressively disclosed; password visibility, inline failures, administrator guidance and the development-only demo action remain available.

Form layouts use shared Field, FormSection, DateRange and Modal components. Long editors separate identity, pricing, contact details, compensation, access permissions, schedules or limits into titled fieldsets. Short forms remain a focused vertical sequence. Sheet and dialog headers provide the task and description; a persistent footer keeps cancel and save actions separate from scrolling fields.

Controls inside labelled fields are 44px high; textareas begin at 108px. Labels sit above controls, required indicators share the caption row, and hints and errors remain below the field. Currency and percentage suffixes sit in a dedicated attached unit area. Browser validation displays inline errors and blocks primary modal actions until native constraints and required selects are satisfied. API validation and money calculations remain server-authoritative.

Editor grids respond to panel width rather than viewport width: two columns begin at a 480px content container; narrower editors and phones use one column. Settings places section descriptions beside their fields on desktop, then stacks them on phones. Report date ranges have visible start and end labels. Phone fields use telephone keyboards and contact fields use appropriate autocomplete.

## Do's and Don'ts

- Use shared semantic colors and existing shadcn-svelte primitives.
- Keep primary actions obvious and labels in sentence case.
- Preserve keyboard focus, touch targets, reduced motion, and all loading/error/empty states.
- Show real server data; identify demo photography as illustrative.
- Do not introduce invented metrics, decorative gradients, or motion that delays service.
