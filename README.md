# Glamour with Jannat

Online store for makeup and skincare — built on the same stack as [sara-s-sweet-oasis](https://lovable.dev), rebranded for a separate business with its own GitHub repo and Supabase project.

## Features

- Product catalog with categories, photos, and stock tracking, editable from an admin panel
- Add-to-cart + checkout flow that builds a pre-filled WhatsApp message (no WhatsApp Business API needed)
- A "hidden" admin login: entering a private code into the checkout phone field opens the admin panel instead of placing an order — no separate login page
- Editable hero photo/headline and an "our story" section with an image carousel, all from the admin panel

## Setup

1. **Install dependencies**
   ```sh
   npm i
   ```

2. **Create a new Supabase project** at [supabase.com](https://supabase.com) (or via Lovable Cloud, if you reconnect this project to Lovable). Do not reuse the sara-s-sweet-oasis project — this store needs its own database.

3. **Run the migrations** in `supabase/migrations/` against your new project, in filename order (oldest first) — either with the Supabase CLI (`supabase db push`) or by pasting each file into the SQL Editor in the Supabase dashboard.

4. **Fill in `.env`** with your new project's URL and public (`sb_publishable_...`) key, from Project Settings → API.

5. **Set your own admin code.** Open `src/lib/admin.server.ts` and change `ADMIN_PHONE_DIGITS` to a private 10-digit code only you know — this is effectively your admin password. The placeholder value shipped here (`5858585858`) is not secret.

6. **Run locally**
   ```sh
   npm run dev
   ```

## WhatsApp order number

Orders are sent as a pre-filled WhatsApp message to the number set in `src/lib/whatsapp.ts` (`WHATSAPP_NUMBER`), currently `218915554139` (Libya country code + `0915554139` with the leading 0 dropped). Update it there if the store's number changes.

## Deployment

The included `nitro`/Vite build targets Cloudflare Workers by default. Push to a **private** GitHub repository — the `.github/workflows/keep-database-awake.yml` job pings the database every 6 hours to stop a free-tier Supabase project from pausing, and it reads `.env` directly from the repo, which only works safely if the repo isn't public (the admin code also lives in the source).

This project was originally built with [Lovable](https://lovable.dev).
