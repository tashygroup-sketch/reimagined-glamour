// Phone numbers as customers actually enter them, turned into the one form the shop checks:
// 10 digits starting with 09 (e.g. 0915554139).
//
//   "٠٩١٥٥٥٤١٣٩"        Arabic keypad digits      → 0915554139
//   "+218927810825"     iPhone AutoFill / contact  → 0927810825
//   "00218 91 555 4139" international with spaces → 0915554139
//   "91-555-4139"       without the leading 0     → 0915554139
//
// Used by the order form (so what's sent is already clean) and again by the server (so a
// number is never refused just for how it was typed).

export function westernDigits(raw: string): string {
  return (raw ?? "")
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function normalizeLibyanPhone(raw: string): string {
  let digits = westernDigits(raw).replace(/\D/g, "");
  if (digits.startsWith("00218")) digits = `0${digits.slice(5)}`;
  else if (digits.startsWith("218") && digits.length === 12) digits = `0${digits.slice(3)}`;
  else if (digits.length === 9 && digits.startsWith("9")) digits = `0${digits}`;
  return digits;
}

export const LIBYAN_MOBILE = /^(091|092|093|094)\d{7}$/;
