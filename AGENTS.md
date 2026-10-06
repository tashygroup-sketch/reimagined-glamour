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
- Product lists are alphabetical (`sortByName` in src/lib/sort.ts, أ–ي default with a ي–أ switch) in both the shop and the control panel; search results stay ordered by best match.
- Every text on the "الواجهة والإعلانات" tab is optional: an emptied field is saved as "" and hidden on the site (null still means "never edited → built-in wording").
