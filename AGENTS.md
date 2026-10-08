<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- All booking entry points route empty carts to the menu and filled carts through the cart review first, so customers cannot submit an itemless order.
- Product and category photos are rendered with `<Photo>` inside a `<PhotoGroup>` (src/components/Photo.tsx): never lazy, retried on failure, and shown together per list. A product's card photo comes from `coverImage(item)` (main photo, else first extra photo, else first value photo) — don't read `image_url` directly for cards.
- Every uploaded photo has a light copy at `menu-photos/thumbs/<same file name>` (about 480px wide; src/lib/photos.ts). Small spots (cards, category squares, cart, colour chips, control panel cards) use `<Photo thumb>`, which falls back to the full photo when the copy is missing. Copies are made in the browser at upload (CropDialog) and, for older photos, in the background while the control panel is open (src/lib/thumbs.ts), which also lists photos whose file is gone. The shop preloads all light copies in the background; a photo already downloaded is shown instantly.
- Product lists are alphabetical (`sortByName` in src/lib/sort.ts) in both the shop and the control panel; search results stay ordered by best match. The "أ – ي" button (src/components/LetterPicker.tsx) opens the alphabet and scrolls to the first product of the chosen letter.
- Every text on the "الواجهة والإعلانات" tab is optional: an emptied field is saved as "" and hidden on the site (null still means "never edited → built-in wording").
- The order form must always get the customer to WhatsApp, because the order only reaches the shop through that message. iPhone Safari blocks a tab opened after waiting for the server, so `openWhatsApp()` in BookingDialog falls back to sending this page to WhatsApp, and the confirmation screen keeps a real WhatsApp link. Don't go back to a bare `window.open` after an `await`.
- Phone numbers go through `normalizeLibyanPhone()` (src/lib/phone.ts) in the form and again on the server: Arabic keypad digits, "+218…" and spaces are accepted. Every order is also saved and listed in the control panel's "الطلبات" tab.
- A WhatsApp link can only carry text, so order photos live on a page: every order line saves its photo (`photoForChoice()`: the chosen value's photo, else the product's card photo), and the message's first link is `/o/<order id>` (src/routes/o.$id.tsx), whose og:image gives WhatsApp a preview. That page shows products only, never the customer's details.
