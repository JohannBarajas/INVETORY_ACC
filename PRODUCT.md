# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Store staff (primary).** Employees at phone stores in the Bronx, working the counter on their own phones. They sign in with a sign-in ID and a 4–6 digit code (no email). Their job: find an accessory fast, record a sale while the customer waits, fix a stock count, and see what's running low. They often use one hand and have a customer in front of them.
- **The owner (sole admin).** One owner runs the business. They sign in with email, manage stores, employees, products and the customer catalog, and read the day summary in the WhatsApp group.
- **Customers (secondary).** People who open the public catalog link to check what's available and the price. They never sign in.

## Product Purpose

An inventory app for cell phone accessory stores: cases, screen protectors, chargers, cables. It keeps per-store stock accurate without extra work: every sale comes off the shelf automatically, stock below its alert level gets flagged, and the owner sees each store's day without being there.

Success: staff record every sale in seconds at the counter, stock counts match the shelf, and the owner knows what to reorder and what each store sold, without spreadsheets or phone calls.

## Positioning

Built for one small, multi-store accessory business, not as general retail POS. Staff sign in with an ID and a code instead of an email. The day summary is formatted to paste into the owner's WhatsApp group. The whole app is sized for one phone in one hand at a busy counter.

## Operating Context

- 1–3 stores and a few employees. The catalog runs from tens to a few hundred items.
- Used in-store on staff phones, often added to the home screen as a web app. The public catalog may also run on a store tablet.
- Daily rituals: open the app → pick the store → sell and adjust stock through the day → copy the day summary into WhatsApp.
- Live updates: every phone sees stock and sales changes without refreshing.
- **Main pain point:** finding the right item fast as the list grows (many similar names such as "Case iPhone 16" vs "Case iPhone 16 Pro").

## Capabilities and Constraints

- Store picker; per-store inventory with cost, price, stock, and a −/+ stepper for quick corrections and deliveries.
- Sell flow: pick item → price and quantity → stock goes down. You can't sell more than the store has.
- Reorder alert: items below their threshold (default 3) are listed at the top.
- Today's sales per store, with seller, time and **Void** (units go back to stock).
- Day summary copied for WhatsApp (sales, total, profit, reorder list).
- Owner tools: stores, employees (add / edit / remove, ID, code, status, last sign-in, sales today and over 7 days), customer catalog link.
- Optional product photos (camera, gallery, paste), shrunk before upload.
- Public customer catalog: photo, name, price, Available / Sold out. It never shows units or cost.
- Security: 5 wrong codes lock an ID for 15 minutes; each business sees only its own data.
- Stack: plain HTML/CSS/JS with no build step, plus Supabase (database, auth, realtime, storage). Deployed as a static site (Vercel or Netlify).
- **Language:** the UI works in **English and Spanish** (`i18n.js`). It follows the phone's language until someone picks one with the English / Español switch; the choice is saved on that phone. Product names are data and stay as the owner typed them.
- Currency: USD.

## Brand Commitments

- Name: "Accessory Inventory" (home-screen name "Inventory"). There's an existing app icon (`icon.svg`).
- Voice: **clean, fast, practical.** Short, plain words a busy employee understands at a glance. No jargon, no marketing language.

## Evidence on Hand

- Real product: working app (`index.html`, `app.js`, `styles.css`) and Supabase schema and migrations (`supabase/`).
- No customer testimonials, metrics or press exist. Don't fabricate them.

## Product Principles

1. **Counter speed first.** The most common action, recording a sale, should take the fewest taps and be reachable with a thumb.
2. **Finding beats browsing.** As the catalog grows, search and recognition (photos, distinct names) matter more than lists.
3. **Stock is truth.** Every change to stock is explicit, reversible where it can be, and visible on every phone right away.
4. **The owner sees everything; staff see what they need.** Cost, profit and codes stay with the owner and staff screens. Customers see only price and availability.
5. **Plain words in two languages.** Every label and message must make sense to a busy employee, in English or Spanish.

## Accessibility & Inclusion

- Staff use phones one-handed, in mixed store lighting: keep touch targets large and text readable.
- English and Spanish speakers on staff (see Language above).
