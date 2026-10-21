# INVETORY_ACC — Accessory Inventory

Phone-first inventory app for cell phone accessory stores (cases, screen protectors, chargers, cables).
One owner, several stores, several employees. Every sale comes off the shelf automatically.

## What it does

- **Pick your store** when you open the app.
- **Inventory:** each accessory with its cost and the stock in that store. Tap **−** / **+** for quick corrections or deliveries.
- **Sell:** pick the accessory, enter the price and quantity → the sale is recorded and the stock goes down. Can't sell more than what's in the store.
- **Reorder alert:** anything below its alert level (3 by default) shows in a red box at the top.
- **Today's sales:** total for the store, who sold what, **Void** to undo a mistake (units go back to stock).
- **Day summary:** one tap copies a summary to paste into the owner's WhatsApp group.
- **Logins:** the owner signs in with email. In **Settings → Employees** the owner adds each employee with just a **name, ID and 4–6 digit code**; employees sign in with ID + code (no email). 5 wrong codes lock the ID for 15 minutes. The **Employees** page shows each employee's ID, status, date added, last sign-in and sales (today / 7 days), with Add, Edit and Remove. Each business only sees its own data.
- **Photos (optional):** add a thumbnail to any accessory by taking it with the camera, choosing it from the gallery, or pasting a copied image. Photos are shrunk before upload.
- **Customer catalog:** a public page (no login) with photo, name, price and Available / Sold out — never units or cost. The owner shares it from **Settings → Customer catalog**; staff tap **Staff sign in** to see everything. With `CATALOG_CODE` set in `config.js`, the main link opens on the catalog for anyone not signed in.
- **Live:** every phone sees changes without refreshing.
- **Find fast:** search understands Spanish words and short model names ("funda 16pm" finds *Case iPhone 16 Pro Max*, "mica" finds *Glass…*, "cargador" finds *Charger…*). Chips filter by kind: Cases, Screen protectors, Chargers, Cables, Other. The kind comes from the product name; new words go in `SYN` in `i18n.js`. Employees don't see cost in the list.
- **English / Español:** the app follows the phone's language. Anyone can switch with the English / Español buttons on the sign-in screen, the store picker, Settings or the catalog; the choice is saved on that phone. Prices can be typed with a comma or a dot (19,99 or 19.99).

## Stack

Plain HTML/CSS/JS (no build step) + [Supabase](https://supabase.com) for the database, logins and live updates.

```
index.html            page shell
styles.css            styles (light/dark, phone-first)
app.js                the app
i18n.js               English / Spanish text, money and date formats, server error translations
config.js             your Supabase URL + anon key  ← edit this
supabase/schema.sql   tables, security rules, sale/stock functions, photo storage
supabase/002_photos.sql  photo update for projects set up before photos existed
supabase/003_employees.sql  employee ID + code logins for projects set up before that existed
supabase/004_catalog.sql    public customer catalog for projects set up before that existed
supabase/005_employee_info.sql  last sign-in + sales per employee
supabase/006_edit_employee.sql  owner edits name, sign-in ID, code and access
supabase/007_show_codes.sql     owner can see employee codes in the app
supabase/008_fix_duplicate_business.sql  merges an accidental second business; one business per owner
```

## Setup (one time)

1. **Database** — Supabase → your project → **SQL Editor** → New query → paste all of `supabase/schema.sql` → **Run**.
2. **Keys** — Supabase → **Project Settings → API**. Copy **Project URL** and the **publishable** (or anon) key into `config.js`.
3. **Employee logins** — Supabase → **Authentication → Sign In / Providers** → turn on **Allow anonymous sign-ins** (employees sign in with ID + code on top of a guest session).
4. **Email confirmation (optional)** — Supabase → **Authentication → Sign In / Providers → Email**. Turn off "Confirm email" while testing so new accounts can sign in right away. Turn it back on before real customers use it.
5. **Publish** — on [Vercel](https://vercel.com) or [Netlify](https://netlify.com): *Add new project → Import* this GitHub repo → no build command, output folder is the repo root → Deploy.
6. Open the site on your phone → **Create account** → **I own the stores** → enter the business and store names.
   On iPhone: Share → **Add to Home Screen** so it opens like an app.

## Run locally

```bash
npx serve .
```
Then open the address it prints. (Opening `index.html` directly from the file system won't work because the app uses JavaScript modules.)
