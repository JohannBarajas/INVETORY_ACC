---
name: Accessory Inventory
description: Phone-first stock and sales for Bronx phone-accessory stores.
colors:
  harbor-teal: "#0f4c5c"
  harbor-teal-ink: "#ffffff"
  tag-yellow: "#f6c445"
  tag-yellow-ink: "#2a2100"
  reorder-red: "#b3261e"
  reorder-red-wash: "#fdeceb"
  counter-mist: "#f3f5f4"
  surface: "#ffffff"
  ink: "#14232a"
  muted: "#5b6b70"
  line: "#dde3e2"
  soft: "#eaf0ef"
  harbor-teal-dark: "#5fb3c4"
  harbor-teal-ink-dark: "#08191d"
  reorder-red-dark: "#ff8a80"
  reorder-red-wash-dark: "#331816"
  counter-mist-dark: "#0d1619"
  surface-dark: "#152227"
  ink-dark: "#e7eeee"
  muted-dark: "#93a4a8"
  line-dark: "#24363c"
  soft-dark: "#1b2c32"
typography:
  display:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(24px, 7vw, 30px)"
    fontWeight: 800
    lineHeight: 1.1
  headline:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(20px, 6vw, 24px)"
    fontWeight: 800
    lineHeight: 1.1
  title:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 800
    lineHeight: 1.1
  body:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
  item-name:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.25
  label:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  eyebrow:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    letterSpacing: "0.08em"
  number:
    fontFamily: "IBM Plex Mono, ui-monospace, Menlo, monospace"
    fontSize: "20px"
    fontWeight: 600
    fontFeature: "tnum"
rounded:
  tag: "4px"
  thumb-sm: "8px"
  thumb: "10px"
  thumb-lg: "14px"
  control: "12px"
  card: "16px"
  sheet: "20px"
  pill: "99px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "16px"
  xl: "18px"
components:
  button-primary:
    backgroundColor: "{colors.harbor-teal}"
    textColor: "{colors.harbor-teal-ink}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
    height: "50px"
  button-sell:
    backgroundColor: "{colors.tag-yellow}"
    textColor: "{colors.tag-yellow-ink}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
    height: "50px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
    height: "50px"
  button-danger:
    backgroundColor: "{colors.reorder-red}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "12px 16px"
    height: "50px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px"
    height: "50px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "16px"
  stepper-button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    size: "46px"
  price-tag:
    backgroundColor: "{colors.tag-yellow}"
    textColor: "{colors.tag-yellow-ink}"
    typography: "{typography.number}"
    padding: "1px 8px 1px 10px"
  reorder-box:
    backgroundColor: "{colors.reorder-red-wash}"
    textColor: "{colors.reorder-red}"
    rounded: "{rounded.card}"
    padding: "12px 14px"
---

# Design System: Accessory Inventory

## Overview

**Creative North Star: "The Price Tag"**

The app borrows from the shelf label on every accessory peg: a yellow tag, a bold name, a number you can read from arm's length. Everything else steps back: calm harbor-teal chrome, flat white cards on a misty grey-green ground, and thin borders instead of shadows. The yellow is saved for the moments that are about money changing hands: the **Sell** button, and prices in the customer catalog.

Density is set for a thumb, not a mouse. Controls are chunky (50px tall, 12px corners), rows give the item name room, and numbers are always set in a tabular mono so stock counts and totals line up and never jitter while someone taps − / +. The layout is a single 640px column with a sticky header for the store name and search, and a fixed bottom bar for the two most-used actions.

The tone is clean, fast, practical. Nothing decorative, no gradients, no illustration. Personality comes from three things only: the yellow tag, the heavy Archivo headings, and the mono numbers.

**Key Characteristics:**
- Flat surfaces with 1px borders; depth only for sheets and toasts.
- One loud accent (Tag Yellow) for selling and price; Harbor Teal for everything else that's interactive.
- Reorder Red is a status color only: low stock, voids, destructive actions.
- Tabular mono for every number a person compares: stock, cost, price, totals, codes.
- Thumb-first: primary actions live in the bottom bar; targets are 44–50px.
- Light and dark themes follow the system setting.

## Colors

A calm teal-and-mist base with one bright price-tag yellow and a single alert red.

### Primary
- **Harbor Teal** (#0f4c5c; dark theme #5fb3c4): the brand and default action color. Primary buttons, links, the store arrow, "Available" in the catalog, the app icon and the browser theme color.

### Secondary
- **Tag Yellow** (#f6c445, text on it #2a2100): the selling accent. The bottom-bar **Sell** button, catalog price tags, revealed employee codes, and the focus ring. Same in both themes.

### Tertiary
- **Reorder Red** (#b3261e; dark #ff8a80) with **Reorder Wash** (#fdeceb; dark #331816): status only. The reorder box, low stock counts, Void, Remove/Delete, error messages, "Access off" and "Sold out".

### Neutral
- **Counter Mist** (#f3f5f4; dark #0d1619): page background and sticky header.
- **Surface** (#ffffff; dark #152227): cards, lists, sheets, inputs, bottom bar.
- **Ink** (#14232a; dark #e7eeee): body text and item names.
- **Muted** (#5b6b70; dark #93a4a8): labels, meta lines, eyebrows, empty states.
- **Line** (#dde3e2; dark #24363c): every border and row divider.
- **Soft** (#eaf0ef; dark #1b2c32): quiet fills: the chosen item in the sale sheet, link boxes, photo placeholders, the "Active" pill.

### Named Rules
**The One Tag Rule.** Tag Yellow means "money." It goes on the Sell action and on prices (plus the focus ring and revealed codes), never on generic buttons, banners or decoration.

**The Red Is Status Rule.** Reorder Red marks something that needs attention or can't be undone. It is never a brand or decoration color.

## Typography

**Display Font:** Archivo 800 (with Helvetica Neue, Arial)
**Body Font:** Figtree 400/600/700 (with system-ui)
**Label/Mono Font:** IBM Plex Mono 500/600 (with ui-monospace, Menlo)

**Character:** A heavy, compact grotesk for headings that reads like shelf signage, a friendly humanist sans for everything you read, and a mono for every number so figures line up like a receipt.

### Hierarchy
- **Display** (800, clamp(24px, 7vw, 30px), 1.1): page titles: "Which store are you in?", "Employees", the business name in the catalog.
- **Headline** (800, clamp(20px, 6vw, 24px), 1.1): the store name in the sticky header, sheet titles.
- **Title** (800, 17px, 1.1): card section titles (Stores, Customer catalog, employee names).
- **Body** (400, 16px, 1.45): running text and sale rows. Inputs stay at 16px so iOS never zooms.
- **Item name** (Figtree 700, 17px, 1.25): product names in the inventory list.
- **Label** (600, 13px): form labels and fine print, Muted color.
- **Eyebrow** (700, 12px, 0.08em, uppercase): context over titles: "TODAY'S SALES", "REORDER · RUNNING LOW".
- **Number** (Plex Mono 600, 18–24px, tabular): stock counts, totals and amounts.

### Named Rules
**The Receipt Rule.** Any number a person compares or counts is set in IBM Plex Mono with tabular figures. Prose numbers ("3 items") may stay in Figtree.

## Layout

A single centered column, max 640px wide, with 16px side gutters (or the safe-area inset if it's larger). Sections stack with 14px gaps; inside cards the gap is 10–12px. The store screen has three fixed zones: a **sticky header** (the store-name menu button and search, about 120px tall) that sits on Counter Mist with a bottom border, a **scrolling body** (reorder box, today's sales, inventory list), and a **fixed bottom bar** (Sell 2fr, + Add 1fr) on Surface. The body reserves 110px plus the safe area at the bottom so the bar never covers the last row.

Sheets slide up from the bottom, max 520px wide and 92% of the viewport high, with their actions in a footer row (Cancel left or right, primary flexing to fill).

Responsive: phone-first with few breakpoints. Below 360px the inventory row's stepper wraps under the name; below 380px the employee summary drops to two columns; at 560px and up the customer catalog grid goes from two to three columns.

**The Thumb Zone Rule.** The actions staff use most go in the bottom bar or the bottom of a sheet, never only in the header.

## Elevation & Depth

The system is flat. Cards, lists, rows and inputs sit on the page with 1px Line borders and no shadow; hierarchy comes from Surface on Counter Mist, not from lift. Depth appears in only two places: sheets, which sit over a dimmed backdrop (rgba(5,15,18,.5)) with 20px top corners, and the toast, which inverts the colors (Ink background, Mist text) so it reads as temporary.

**The Border, Not Shadow Rule.** Separate things with a 1px Line border or a change of surface. Don't add box-shadows to cards or buttons.

## Shapes

Soft but firm corners on a fixed scale: 12px for controls (buttons, inputs, steppers, chosen-item box), 16px for cards and lists, 20px for the top of sheets, 10px for thumbnails (8px small, 14px large), and a full pill for status chips. The one deliberately asymmetric shape is the **price tag**: 4px on the left and 10px on the right, like a hang-tag. Product photos are square crops; with no photo, a Soft tile shows the item's first letter in Archivo.

## Components

### Buttons
Chunky and thumb-sure.
- **Shape:** gently rounded (12px), at least 50px tall, Figtree 700.
- **Primary:** Harbor Teal fill with white text, 12px × 16px padding.
- **Sell:** Tag Yellow fill with dark ink, 18px 800 weight. Lives only in the bottom bar.
- **Ghost:** transparent with a 1px Line border and Ink text. Used for secondary actions (+ Add, Cancel, Edit, Log out).
- **Danger:** Reorder Red fill with white text, used only on the final "Yes, remove/delete" confirmation. "Remove" before confirming is a ghost button with red text.
- **Link:** no fill, Harbor Teal 700 text, at least 44px tall: Change store, Done, Settings.
- **Focus:** 3px Tag Yellow outline with a 2px offset on every button and input. **Disabled:** 45% opacity.

### Chips
- **Status pill:** 12px uppercase 700, 99px radius. "Active" is Harbor Teal on Soft; "Access off" is Reorder Red on Reorder Wash.
- **Availability:** catalog "Available" (Teal) / "Sold out" (Red) as 12px uppercase text, no fill.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** Surface on Counter Mist.
- **Shadow Strategy:** none (see Elevation).
- **Border:** 1px Line.
- **Internal Padding:** 16px (14px for list rows and sale rows).

### Inputs / Fields
- **Style:** Surface fill, 1px Line border, 12px radius, 12px padding, 50px tall, 16px text. Labels sit above in 13px 600 Muted.
- **Focus:** 3px Tag Yellow outline.
- **Error:** a 14px Reorder Red message below the form, announced with role="alert".

### Navigation
There's no tab bar. The store picker is the home screen (one large card per store). On the store screen, the store name (Headline size, one line with an ellipsis) is itself a button with a Harbor Teal chevron. It opens the **store menu**, a bottom sheet with: the store list (current store marked "You're here" in Teal; others show their units and switch in one tap), then a grouped list of Employees (owner only), Settings / Account and Log out (in red), then the language switch and a Close button. Nothing else lives in the header. Settings and Employees pages use a "Done" link at the top right to go back.

### Language Switch
Two side-by-side 44px ghost buttons, "English" and "Español" (each name in its own language). The selected one gets a Harbor Teal border and text on Soft. It sits centered at the bottom of the sign-in, store picker and catalog screens, left-aligned in its own Settings card, and inside the store menu. Never in the store screen header itself.

### Inventory Row (signature)
A three-column grid: a 52px thumbnail, the item name (17px 700) above a "Cost · Price · Edit" meta line, and a stepper. The stepper is two 46px square ghost buttons around a 20px mono count; the count turns Reorder Red when it's below the alert level.

### Reorder Box (signature)
A Reorder Wash card with a red border at the top of the store screen: an eyebrow "REORDER · RUNNING LOW" with a mono count, then one line per item with "N left" or "sold out" in red.

### Price Tag (signature)
A mono price on Tag Yellow with the asymmetric hang-tag corner (4px / 10px). Used in the customer catalog.

## Do's and Don'ts

### Do:
- **Do** keep every tappable control at least 44px, and primary controls at 50px.
- **Do** set stock, prices, totals and codes in IBM Plex Mono with tabular figures.
- **Do** put the most-used actions (Sell, Add) in the fixed bottom bar.
- **Do** use Line borders (1px #dde3e2) and Surface/Mist contrast to separate things.
- **Do** keep inputs at 16px text so phones don't zoom.
- **Do** define every color as a CSS variable with a dark-theme value.

### Don't:
- **Don't** use Tag Yellow for anything but selling, prices, the focus ring and revealed codes.
- **Don't** use Reorder Red as decoration; it means low stock, errors or destructive actions.
- **Don't** add shadows to cards, rows or buttons; only sheets and toasts sit above the page.
- **Don't** add gradients, illustrations or decorative imagery; product photos are the only images.
- **Don't** shrink controls below 44px to fit more on screen.
