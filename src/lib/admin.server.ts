// Server-only. Do NOT import this from a route file, a client component, or the top level
// of shop.functions.ts — only via `await import("@/lib/admin.server")` inside a
// createServerFn().handler() body. That keeps the admin trigger code out of the
// client-side JS bundle entirely (unlike a plain top-level export, which ships to the
// browser even if nothing appears to call it).
export const ADMIN_PHONE_DIGITS = "6767676767";

export function normalizePhone(raw: string) {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.replace(/^00218/, "0").replace(/^218/, "0");
}

export function isAdminPhone(raw: string) {
  return normalizePhone(raw) === ADMIN_PHONE_DIGITS;
}
