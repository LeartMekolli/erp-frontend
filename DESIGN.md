---
name: AMI
description: Operations for made-to-order production, for staff, partner workshops and the platform admin.
colors:
  ground: "#efeef4"
  card: "#ffffff"
  ink: "#16141c"
  ink-2: "#67647a"
  line: "#ecebf2"
  lilac: "#ece8fd"
  lilac-2: "#d9d1fa"
  violet: "#6d5ae6"
  violet-ink: "#3b2f8f"
  late: "#d0303a"
  late-ink: "#b3262f"
  ship: "#1d8f63"
  collect: "#e0a33a"
  lost-ink: "#a3246b"
  warn: "#8a5a00"
  panel-soft: "#faf9ff"
  panel-soft-ink: "#5c5873"
  placeholder: "#706d80"
typography:
  display:
    fontFamily: "Albert Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-1.4px"
  headline:
    fontFamily: "Albert Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    letterSpacing: "-0.7px"
  figure:
    fontFamily: "Albert Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.04em"
  body:
    fontFamily: "Albert Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    fontFeature: "tnum"
  label:
    fontFamily: "Albert Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  2xl: "20px"
  full: "9999px"
spacing:
  tap: "44px"
  tile-x: "20px"
  tile-y: "18px"
  gap: "14px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card}"
    rounded: "{rounded.lg}"
    height: "44px"
    padding: "0 16px"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "44px"
    padding: "0 16px"
  button-ghost:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.lg}"
    height: "44px"
    padding: "0 16px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "44px"
    padding: "0 14px"
  tile:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.2xl}"
    padding: "18px 20px"
  tile-need-you:
    backgroundColor: "{colors.lilac}"
    textColor: "{colors.ink}"
    rounded: "{rounded.2xl}"
    padding: "18px 20px"
  nav-link-current:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card}"
    rounded: "{rounded.xl}"
    height: "44px"
  count-active:
    backgroundColor: "{colors.lilac}"
    textColor: "{colors.violet-ink}"
    rounded: "{rounded.full}"
---

# Design System: AMI

## Overview

**Creative North Star: "The Friendly Control Room"**

AMI is where staff, partner workshops and the platform admin watch live work and act on it all day. Like a control room, it holds a lot of live numbers, queues and states on one screen, dense and fast to scan. Unlike most control rooms, it is warm: a soft lavender-grey ground, white panels with generous 20px corners, one violet accent, and black for the action that matters. It should feel **warm, precise and calm**: nothing shouts, every number is exact, and the one thing that needs you is always the easiest to find.

The look is shared by all three areas: staff, partner portal and platform admin. Only the content changes by role, never the style. It must not look like a generic AI-generated template: no gradient text, no glassmorphism, no neon on dark, no decoration that doesn't carry information.

Components are **soft-edged and confident**: rounded, generously sized (44px touch targets), and decisive. One black primary action per area, and plain words on every button.

**Key Characteristics:**
- A lavender-grey ground with white panels floating on it; depth comes from tone, not shadow.
- Black (`ink`) for the primary action and the current place; violet only for focus, selection and data.
- A lilac tile for "what needs you" on each main screen.
- Status is always a dot or icon plus a word, never colour alone.
- Albert Sans throughout, with tabular digits for numbers that line up.
- Light only; dark appears just as the deliberate hero surface on dashboards.

## Colors

A cool, quiet neutral base with one violet accent family and a small, strict set of status colours.

### Primary
- **Workshop Ink** (#16141c): primary buttons, the current sidebar link, headings and body text. The colour of "do this".
- **Signal Violet** (#6d5ae6): focus rings, the text caret, selection, "due soon", and the main data colour in charts. Never used for body text on white at small sizes when `violet-ink` would do.
- **Deep Violet Ink** (#3b2f8f): text on lilac, selected chips, and the darkest step of the chart ramp.

### Secondary
- **Soft Lilac** (#ece8fd): the "Need you today" tile, active counts, initials, success notices. Warm attention without alarm.
- **Lilac Haze** (#d9d1fa): text selection, quiet bars, de-emphasised chart marks.

### Status (reserved)
- **Late Red** (#d0303a) for marks and dots, **Late Ink** (#b3262f) for its text: late, failed, worse.
- **Ship Green** (#1d8f63): ready to ship (marks only, never text on white).
- **Collect Amber** (#e0a33a): waiting for payment, near capacity, nearly used (marks only).
- **Warn Ink** (#8a5a00): warning text and icons, between fine and late.
- **Lost Plum** (#a3246b): a scrapped piece's word and icon, apart from amber's "being redone".

### Neutral
- **Lavender Ground** (#efeef4): the page behind every panel.
- **Panel White** (#ffffff): tiles, tables, dialogs, the sidebar.
- **Hairline** (#ecebf2): borders, dividers, chart grid lines.
- **Slate Ink** (#67647a): secondary text, labels, axis text.
- **Soft Panel** (#faf9ff) with **Soft Panel Ink** (#5c5873): quiet inner panels and their text.
- **Placeholder** (#706d80): input placeholders, at AA contrast.

### Named Rules
**The Ink Means Act Rule.** Black is for the one action that matters and the place you are. Two black buttons side by side means one of them is wrong.

**The Word Beside the Dot Rule.** A status colour never stands alone: it comes with a word ("Late", "Ready to ship") or an icon (▲), so it reads in grayscale and to screen readers.

**The Reserved Status Rule.** Red, green, amber and plum mean their status and nothing else. They are never a chart series, a decoration or a brand accent.

## Typography

**Display Font:** Albert Sans (with ui-sans-serif, system-ui)
**Body Font:** Albert Sans
**Label Font:** Albert Sans

**Character:** One friendly geometric sans for everything. Hierarchy comes from size, weight and tight letter-spacing on big numbers, not from a second family.

### Hierarchy
- **Display** (600, 40px, 1.08, −1.4px): the sign-in headline only.
- **Headline** (600, 26px, −0.7px): page titles ("Orders", "Jobs").
- **Figure** (600, 34px, −0.04em, proportional digits): the big number on a tile. Dashboard hero figures go up to 56–60px in the same style.
- **Body** (400, 14px; 16px in inputs on phones): tables, lists, forms. Tabular digits by default.
- **Label** (500, 13px, `text-caption`): tile titles, hints, small print, column headers.

### Named Rules
**The Exact Number Rule.** Numbers that line up in columns use tabular digits (set on `body`). A big standalone figure uses proportional digits and tight tracking, so `121` doesn't look loose.

## Layout

- **Shell:** a white, full-height sidebar with a `line` border on the right: 240px with labels from 1280px; a 76px icon rail with tooltips from 1024 to 1279px; a drawer sheet below 1024px. The main area sits on `ground` with 12–20px side padding.
- **Pages** start with a title row (headline plus today's date), then a row of tiles, then one main panel (a table with tabs, or a detail layout with a 340px side column from 1280px).
- **Tiles** sit in a grid with 12–14px gaps; the "Need you" tile is wider than the rest (`1.7fr` against `1fr`).
- **Dashboards** use a 12-column bento with `grid-auto-flow: dense`, so tiles hidden by permission leave no gaps.
- **Breakpoints:** 768px (`md`, tiles grow), 1024px (`lg`, sidebar rail), 1280px (`xl`, full sidebar and side columns).
- **Density:** built for all-day use. Rows are compact, but every control keeps a 44px touch target on touch screens (`pointer-coarse`).

## Elevation & Depth

AMI is flat. Depth comes from tonal layering: white panels on a lavender-grey ground, hairline borders where panels meet. Shadows appear only on things that float above the page: popovers and menus (`shadow-md`/`shadow-lg`), the sticky move bar on phones (`0 -8px 24px -12px rgb(22 20 28 / 0.12)`), and a 1px `line` ring on small inset items.

### Named Rules
**The Flat Panel Rule.** A panel resting on the page has no shadow. If it needs to stand out, change its tone (lilac, or dark on dashboards), not its height.

## Shapes

Soft, generous corners that scale with size: 20px on tiles and panels, 16px on sidebar links, 12px on buttons and inputs, 8px on chips and small controls, and fully round on dots, avatars and pill buttons ("Review"). Bars and progress tracks are fully rounded. Chart columns are rounded 4px at the top and square at the base.

## Components

### Buttons
- **Shape:** gently rounded (12px), 44px tall, 14px semibold text, a 16px icon when there is one.
- **Primary:** `ink` with white text; hover lightens to 85%.
- **Secondary:** white with a `line` border and `ink` text; hover takes the `ground` tint.
- **Ghost:** no fill, `ink-2` text, `ground` on hover.
- **Focus:** a 2px `violet` outline, 2px offset, on every control.
- **Disabled:** 50% opacity, no pointer events.

### Badges, counts and notices
- **Counts:** a round pill after a tab or sidebar label. Resting: `line` with `ink-2` text. On the active tab: `lilac` with `violet-ink`.
- **Initials:** workspace and user initials sit in small `lilac` squares or circles with `violet-ink` text.
- **Notices:** success notices are a `lilac` band with `violet-ink` text (12px corners); errors use a `late` tint at 8% with `late-ink` text.

### Cards / Tiles
- **Corner Style:** 20px.
- **Background:** white; the "Need you" tile uses a lilac gradient (`120deg`, `lilac` → `#f4f1ff` → `#e3dcfb`).
- **Shadow Strategy:** none (see Elevation).
- **Internal Padding:** 18px by 20px; 12px on phones.
- **Content:** a 13px `ink-2` title, a 34px figure, and a foot line in `ink-2`.

### Inputs / Fields
- **Style:** white, `line` border, 12px corners, 44px tall, 14px padding.
- **Focus:** the border turns `violet` with a soft violet outline.
- **Error:** the border turns `late`, and the message under the field says what to fix.

### Navigation
- **Sidebar links:** 44px tall, 16px corners, `ink-2` text with a `ground` hover. The current link is solid `ink` with white text. Count badges sit after the label and are part of its accessible name.

### Status
- **Style:** an 8px dot in the status colour plus the word, in `ink` or the status's own ink colour (`late-ink`, `warn`, `lost-ink`). In bars, each part has a 2–4px gap, never a border.

## Do's and Don'ts

### Do:
- **Do** use one black primary action per area, and plain verbs on buttons ("Ship", "Accept", "Pay").
- **Do** show status as a dot or icon plus a word, with `late-ink` (#b3262f) for red text.
- **Do** keep panels flat on the `ground` (#efeef4) and separate them with tone, not shadow.
- **Do** keep every control at 44px on touch screens and give it a visible 2px violet focus ring.
- **Do** use tabular digits for numbers in columns, and keep money as the API's string until it's shown.
- **Do** show what the user may do, and leave out what they may not; never a zero in place of a hidden number.

### Don't:
- **Don't** use `ship` green or `collect` amber as text on white; they fail contrast. Use them for dots and bars only.
- **Don't** use status colours as decoration or as a chart series.
- **Don't** add dark mode; AMI is light only (a dashboard hero tile is the one deliberate dark surface).
- **Don't** use gradient text, glass effects, heavy shadows or generic template layouts.
- **Don't** show partners the customer, the customer's price or the workspace's prices, in any component.
