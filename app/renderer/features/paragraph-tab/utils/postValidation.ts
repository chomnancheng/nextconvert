/** Shared rules for paragraph queue: skip AI slop / separators (e.g. "---"). */

function stripHtml(html: string): string {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.textContent ?? html;
}

export function countWordsInPost(html: string): number {
  return stripHtml(html).trim().split(/\s+/).filter(Boolean).length;
}

/** True if this block should become a queue row (text import or AI). */
export function isQueueablePost(text: string): boolean {
  const plain = stripHtml(text).trim();
  if (plain.length === 0) return false;
  // Single-token junk (---, ___, …, etc.)
  if (countWordsInPost(text) < 2) return false;
  // Only punctuation / separators
  if (/^[-_=•.·\s…]+$/u.test(plain)) return false;
  return true;
}
