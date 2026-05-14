import { toPng } from "html-to-image";
import type { Template, LayoutTemplate, CountRanges } from "../types";
import { DEFAULT_COUNT_RANGES } from "../types";

// 1×1 transparent PNG — used when no profile image is set so <img src=""> never fires
const TRANSPARENT_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function todayDateStr(): string {
  const now = new Date();
  const h = now.getHours() % 12 || 12;
  const m = now.getMinutes().toString().padStart(2, "0");
  return `Today at ${h}:${m} ${now.getHours() >= 12 ? "PM" : "AM"}`;
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1)}K`;
  return `${Math.round(n / 1000)}K`;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (Math.max(min, max) - Math.min(min, max) + 1)) + Math.min(min, max);
}

/** Facebook-style timestamp: clock "today" or relative "Nh ago" (N random 1–24), picked per render. */
function randomPostDateStr(): string {
  if (Math.random() < 0.45) return todayDateStr();
  const hours = randInt(1, 24);
  return `${hours}h ago`;
}

function randomCounts(ranges: CountRanges) {
  return {
    likeCount:    formatCount(randInt(ranges.likeMin,    ranges.likeMax)),
    commentCount: formatCount(randInt(ranges.commentMin, ranges.commentMax)),
    shareCount:   formatCount(randInt(ranges.shareMin,   ranges.shareMax)),
  };
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err instanceof Event) return `Image failed to load (${err.type})`;
  return String(err);
}

export async function renderHtmlTemplateToDataUrl(
  layoutTemplate: LayoutTemplate,
  profile: Template,
  postText: string,
  opts: { dims: { width: number; height: number }; transparent: boolean },
): Promise<string> {
  const { dims, transparent } = opts;

  // Resolve profile image — fall back to transparent pixel so <img src=""> never fires
  let profileImageSrc = TRANSPARENT_PIXEL;
  if (profile.profileImage) {
    try {
      profileImageSrc = await window.electronAPI.imageToDataUrl(profile.profileImage);
    } catch { /* keep placeholder */ }
  }

  const { likeCount, commentCount, shareCount } = randomCounts(
    layoutTemplate.countRanges ?? DEFAULT_COUNT_RANGES,
  );

  // Substitute tokens. {{text}} is raw HTML — not escaped.
  const rendered = layoutTemplate.html
    .replace(/\{\{text\}\}/g, postText)
    .replace(/\{\{profileName\}\}/g, escapeHtml(profile.profileName))
    .replace(/\{\{profileImage\}\}/g, profileImageSrc)
    .replace(/\{\{postDate\}\}/g, escapeHtml(randomPostDateStr()))
    .replace(/\{\{readMoreText\}\}/g, escapeHtml(profile.readMoreText ?? ""))
    .replace(/\{\{likeCount\}\}/g, likeCount)
    .replace(/\{\{commentCount\}\}/g, commentCount)
    .replace(/\{\{shareCount\}\}/g, shareCount);

  const wrap = document.createElement("div");
  wrap.style.cssText = [
    `position:fixed`,
    `left:${-(dims.width + 500)}px`,
    `top:0`,
    `width:${dims.width}px`,
    `height:${dims.height}px`,
    `overflow:hidden`,
    `pointer-events:none`,
  ].join(";");
  wrap.innerHTML = rendered;
  document.body.appendChild(wrap);

  try {
    const root = (wrap.firstElementChild as HTMLElement | null) ?? wrap;
    root.style.width = `${dims.width}px`;
    root.style.height = `${dims.height}px`;
    root.style.setProperty("-webkit-font-smoothing", "antialiased");
    root.style.setProperty("text-rendering", "optimizeLegibility");
    root.style.setProperty("filter", "none");

    if (transparent) {
      root.style.background = "transparent";
      root.style.backgroundImage = "none";
    }

    return await toPng(root, {
      width: dims.width,
      height: dims.height,
      pixelRatio: 1,
      skipAutoScale: true,
    });
  } catch (err) {
    const error = new Error(`HTML render failed: ${toErrorMessage(err)}`);
    (error as Error & { cause: unknown }).cause = err;
    throw error;
  } finally {
    document.body.removeChild(wrap);
  }
}
