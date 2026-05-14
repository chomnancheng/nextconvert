/** Build a short filesystem-safe slug from post HTML or plain text (Reel Stories output names). */
export function slugFromPlainText(htmlOrText: string, maxLen = 40): string {
  const plain = htmlOrText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return asciiSlug(plain.slice(0, 160), maxLen);
}

function asciiSlug(s: string, maxLen: number): string {
  const out = s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, maxLen);
  return out || "post";
}
