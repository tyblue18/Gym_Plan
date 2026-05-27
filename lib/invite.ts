/**
 * lib/invite.ts
 *
 * Shared invite-link constants + helpers used by both the client (capture,
 * banner, share card, redeemer) and the server (redeem route, badge engine).
 *
 * An invite "code" is simply the inviter's username, so the link is
 * `https://<origin>/?invite=<username>`. No new column or token table needed —
 * the referral ledger lives in CoinTransaction (reason `referral_sent` on the
 * inviter, `referral_received` on the invitee), which also dedupes redemptions.
 */

/** localStorage key holding a pending invite code captured from the URL. */
export const INVITE_CODE_KEY = 'queInviteCode';

/** Coins granted when an invite converts (a new user redeems the link). */
export const INVITE_REWARD_INVITER = 10; // for bringing someone in
export const INVITE_REWARD_INVITEE = 5;  // welcome bonus for the new user

/** Invite codes are usernames: 3–20 chars, lowercase letters / numbers / underscore. */
const CODE_RE = /^[a-z0-9_]{3,20}$/;

/** Normalises and validates an invite code; returns null if it isn't a legal username. */
export function normalizeInviteCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const c = raw.trim().toLowerCase();
  return CODE_RE.test(c) ? c : null;
}

/** Builds the shareable invite URL for a given origin + username. */
export function buildInviteUrl(origin: string, username: string): string {
  return `${origin}/?invite=${encodeURIComponent(username)}`;
}
