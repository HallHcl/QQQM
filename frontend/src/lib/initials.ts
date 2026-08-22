/**
 * Derives a deterministic 1-2 letter initial for display in an avatar,
 * purely from a display name — no stored/generated field involved.
 *
 * Two or more words: first letter of the first two words (e.g.
 * "Brightwater Logistics" -> "BL"). Single word: its first two letters
 * (e.g. "Acme" -> "AC"). Always uppercase; falls back to "?" for an
 * empty/whitespace-only name so callers never render a blank avatar.
 */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return (words[0][0] + words[1][0]).toUpperCase();
}
