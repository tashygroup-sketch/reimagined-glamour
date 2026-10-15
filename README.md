# Glamour with Jannat

Online store for makeup and skincare, running entirely on Cloudflare (Workers + D1 + KV).

## Features

- Product catalog with categories, photos, and stock tracking, editable from an admin panel
- Add-to-cart + checkout flow that builds a pre-filled WhatsApp message (no WhatsApp Business API needed)
- A "hidden" admin login: entering a private code into the checkout phone field opens the admin panel instead of placing an order — no separate login page
- Editable hero photo/headline and an "our story" section with an image carousel, all from the admin panel

## Setup

Everything runs on Cloudflare (no Supabase): the website is a Worker, the shop's data is in a
**D1 database** and the photos are in a **Workers KV namespace**. Both are on Cloudflare's free
plan and need no card.

1. **Create the two storage spaces** in the Cloudflare dashboard:
   - Storage & databases → D1 SQL database → Create → name `glamour-db` → copy the Database ID.
   - Storage & databases → Workers KV → Create → name `glamour-photos` → copy the ID.
2. **Put the two IDs in `wrangler.json`** (`database_id` and `id`). The tables are created by
   the site itself the first time it runs; nothing to run by hand.
3. **Set your own admin code** in `src/lib/admin.server.ts` (`ADMIN_PHONE_DIGITS`) — this is the
   control panel's password. Typing it in the order form's phone field opens the panel.
4. **Deploy**: push to GitHub; Cloudflare builds and deploys it (`npm run build`, then
   `npx wrangler deploy`).

The first run imports the products, categories, ads and texts from
`src/lib/seed/glamour-start.json` (exported from the old Supabase project). Their photos are
copied from the old Supabase storage into Cloudflare automatically (by the control panel while
it's open, and by the shop the first time a photo is shown). Once the control panel says every
photo has moved, the old Supabase project can be deleted.

## WhatsApp order number

Orders are sent as a pre-filled WhatsApp message to the number set in `src/lib/whatsapp.ts` (`WHATSAPP_NUMBER`), currently `218918640785` (Libya country code + `0918640785` with the leading 0 dropped). Update it there if the store's number changes.

## Deployment

The `nitro`/Vite build targets Cloudflare Workers; `wrangler.json` is merged into the generated
config, which is how the `DB` and `PHOTOS` bindings reach the Worker. Keep the GitHub repository
**private** — the admin code lives in the source.

This project was originally built with [Lovable](https://lovable.dev).
