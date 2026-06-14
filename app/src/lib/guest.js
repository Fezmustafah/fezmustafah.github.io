// guest.js — lets someone try the AI without an account. 5 free generations,
// tracked in localStorage on this device only (no cloud, no quota RPC).
const FLAG = "ls_guest";
const CREDITS = "ls_guest_credits";
export const GUEST_MAX = 5;

export function isGuest() {
  try { return localStorage.getItem(FLAG) === "1"; } catch { return false; }
}
export function startGuest() {
  try {
    localStorage.setItem(FLAG, "1");
    if (localStorage.getItem(CREDITS) == null) localStorage.setItem(CREDITS, String(GUEST_MAX));
  } catch { /* ignore */ }
}
export function endGuest() {
  try { localStorage.removeItem(FLAG); } catch { /* ignore */ }
}
export function guestCredits() {
  try {
    const v = localStorage.getItem(CREDITS);
    return v == null ? GUEST_MAX : Math.max(0, parseInt(v, 10) || 0);
  } catch { return GUEST_MAX; }
}
// decrement and return remaining; returns -1 if already out.
export function spendGuestCredit() {
  const left = guestCredits();
  if (left <= 0) return -1;
  const next = left - 1;
  try { localStorage.setItem(CREDITS, String(next)); } catch { /* ignore */ }
  return next;
}
