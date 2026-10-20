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
- **Logins:** the owner creates the business and gets a 6-character code; employees sign up and join with it. Each business only sees its own data.
- **Live:** every phone sees changes without refreshing.

## Stack

Plain HTML/CSS/JS (no build step) + [Supabase](https://supabase.com) for the database, logins and live updates.

```
index.html            page shell
styles.css            styles (light/dark, phone-first)
app.js                the app
config.js             your Supabase URL + anon key  ← edit this
supabase/schema.sql   tables, security rules, sale/stock functions
```

## Setup (one time)

1. **Database** — Supabase → your project → **SQL Editor** → New query → paste all of `supabase/schema.sql` → **Run**.
2. **Keys** — Supabase → **Project Settings → API**. Copy **Project URL** and the **anon public** key into `config.js`.
3. **Email confirmation (optional)** — Supabase → **Authentication → Sign In / Providers → Email**. Turn off "Confirm email" while testing so new accounts can sign in right away. Turn it back on before real customers use it.
4. **Publish** — on [Vercel](https://vercel.com) or [Netlify](https://netlify.com): *Add new project → Import* this GitHub repo → no build command, output folder is the repo root → Deploy.
5. Open the site on your phone → **Create account** → **I own the stores** → enter the business and store names.
   On iPhone: Share → **Add to Home Screen** so it opens like an app.

## Run locally

```bash
npx serve .
```
Then open the address it prints. (Opening `index.html` directly from the file system won't work because the app uses JavaScript modules.)
