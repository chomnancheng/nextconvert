import { useState, useCallback } from "react";
import type { LayoutTemplate } from "../types";

const STORAGE_KEY = "layout-templates";

// ── Default "Facebook Posts" template ────────────────────────────────────────
// Fills whatever export size Settings uses (e.g. 720×1280 or 1080×1920).
// container-type + cqw scales type to frame width; inline styles for capture.
// {{field}} tokens are replaced at render time.
export const FACEBOOK_POSTS_HTML = `<div style="container-type:inline-size;width:100%;height:100%;min-height:100%;box-sizing:border-box;background:linear-gradient(180deg,#E9EBEE,#D8DADF);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;flex-direction:column;padding:clamp(14px,3.5cqw,56px) clamp(12px,2.8cqw,44px) clamp(12px,2.5cqw,48px);gap:clamp(10px,1.5cqw,24px);overflow:hidden;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <div style="flex:1;min-height:0;display:flex;flex-direction:column;gap:clamp(10px,1.5cqw,24px);">

    <div style="flex:1;min-height:0;display:flex;flex-direction:column;background:rgb(255,255,255);border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,0.18);padding:clamp(16px,3.8cqw,44px) clamp(18px,4.5cqw,56px);box-sizing:border-box;overflow:hidden;">

      <div style="display:flex;align-items:center;gap:clamp(12px,1.8cqw,22px);flex-shrink:0;">
        <img src="{{profileImage}}" alt="" style="width:clamp(76px,10cqw,118px);height:clamp(76px,10cqw,118px);border-radius:50%;object-fit:cover;background:#BEC3C9;flex-shrink:0;" />
        <div style="min-width:0;flex:1;">
          <div style="position:relative;display:inline-block;max-width:100%;padding:clamp(4px,0.6cqw,8px) clamp(2px,0.4cqw,6px);margin:clamp(-4px,-0.6cqw,-8px) 0;box-sizing:content-box;">
            <div style="font-weight:700;font-size:clamp(32px,6.5cqw,50px);line-height:1.2;color:#050505;filter:blur(clamp(5px,0.85cqw,10px));-webkit-filter:blur(clamp(5px,0.85cqw,10px));opacity:0.9;user-select:none;pointer-events:none;">{{profileName}}</div>
            <div style="position:absolute;left:0;top:0;right:0;bottom:0;border-radius:clamp(6px,1cqw,12px);background:linear-gradient(105deg,rgba(255,255,255,0.55) 0%,rgba(245,246,248,0.72) 45%,rgba(255,255,255,0.5) 100%);backdrop-filter:blur(clamp(3px,0.5cqw,8px));-webkit-backdrop-filter:blur(clamp(3px,0.5cqw,8px));pointer-events:none;"></div>
          </div>
          <div style="font-size:clamp(21px,4cqw,32px);color:#65676B;margin-top:clamp(5px,0.75cqw,10px);line-height:1.35;">{{postDate}} · 🌐</div>
        </div>
      </div>

      <div style="flex:1;min-height:0;margin-top:clamp(8px,1.2cqw,16px);font-size:clamp(28px,5.2cqw,50px);line-height:1.65;color:#050505;word-wrap:break-word;overflow-wrap:break-word;overflow-y:auto;">{{text}}</div>

      <div style="display:flex;justify-content:space-between;align-items:center;padding:clamp(10px,1.4cqw,16px) 0;color:#65676B;font-size:clamp(20px,4cqw,34px);border-bottom:1px solid #E4E6EB;margin-top:clamp(8px,1.1cqw,14px);flex-shrink:0;">
        <span style="display:inline-flex;align-items:center;gap:clamp(4px,0.7cqw,8px);"><span style="font-size:1.2em;line-height:1;">👍</span><span style="font-size:1.2em;line-height:1;">❤️</span><span>{{likeCount}}</span></span>
        <span>{{commentCount}} Comments · {{shareCount}} Shares</span>
      </div>

      <div style="display:flex;justify-content:space-around;align-items:center;padding:clamp(10px,1.4cqw,16px) 0;color:#65676B;font-size:clamp(22px,4.3cqw,38px);font-weight:600;flex-shrink:0;">
        <span style="display:inline-flex;align-items:center;gap:clamp(6px,1cqw,12px);"><span style="font-size:1.25em;line-height:1;">👍</span><span>Like</span></span>
        <span style="display:inline-flex;align-items:center;gap:clamp(6px,1cqw,12px);"><span style="font-size:1.25em;line-height:1;">💬</span><span>Comment</span></span>
        <span style="display:inline-flex;align-items:center;gap:clamp(6px,1cqw,12px);"><span style="font-size:1.25em;line-height:1;">↗</span><span>Share</span></span>
      </div>

    </div>

    <div style="display:flex;flex-direction:column;align-items:center;gap:clamp(10px,1.4cqw,14px);flex-shrink:0;">
      <div style="font-size:clamp(24px,4.6cqw,42px);font-weight:700;color:#1877F2;letter-spacing:0.02em;line-height:1.2;-webkit-font-smoothing:antialiased;">{{readMoreText}}</div>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1877F2" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:clamp(48px,6.5cqw,72px);height:clamp(48px,6.5cqw,72px);flex-shrink:0;"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
    </div>

  </div>
</div>`;

function makeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function loadFromStorage(): LayoutTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LayoutTemplate[];
      // Migrate default "Facebook Posts" template through layout revisions.
      const migrated = parsed.map((t) => {
        let html = t.html;
        // v1→v2: replace hardcoded counts with tokens
        if (!html.includes("{{likeCount}}") && html.includes("1.4K")) {
          html = html
            .replace(/1\.4K/g, "{{likeCount}}")
            .replace(/234 Comments/g, "{{commentCount}} Comments")
            .replace(/87 Shares/g, "{{shareCount}} Shares");
        }
        // v2→v3: move {{readMoreText}} outside the card as a CTA
        if (html.includes('color:#1877F2;margin-bottom:22px;">{{readMoreText}}</div>')) {
          html = FACEBOOK_POSTS_HTML;
        }
        // v3/v4→v5: switch to explicit outer padding (padding-top+centering was unreliable)
        if (html.includes('padding-top:80px;gap:28px')) {
          html = FACEBOOK_POSTS_HTML;
        }
        // v5→v6: drop align-items:center + width:100% on card (use stretch + no width instead)
        if (html.includes('align-items:center;padding:20px 40px 40px')) {
          html = FACEBOOK_POSTS_HTML;
        }
        // v6→v7: fixed 1080×1920 Facebook-style shell (any outer padding, e.g. 80/40/60 or 40×3)
        // → responsive fill + cqw typography + CTA in flex flow
        if (
          html.includes("width:1080px;height:1920px") &&
          html.includes("{{profileName}}") &&
          html.includes("linear-gradient(180deg,#E9EBEE,#D8DADF)") &&
          !html.includes("container-type:inline-size")
        ) {
          html = FACEBOOK_POSTS_HTML;
        }
        // v7→v8: larger type + solid card (sharper name) + bigger avatar / action icons
        if (html.includes("clamp(60px,8cqw,92px)") && html.includes("container-type:inline-size")) {
          html = FACEBOOK_POSTS_HTML;
        }
        // v8→v9: “rumor” look — blurred name + frosted overlay (replaces readable name)
        if (
          html.includes("clamp(76px,10cqw,118px)") &&
          html.includes("container-type:inline-size") &&
          html.includes("{{profileName}}") &&
          !html.includes("-webkit-backdrop-filter:blur(clamp(3px")
        ) {
          html = FACEBOOK_POSTS_HTML;
        }
        return html !== t.html ? { ...t, html } : t;
      });
      const changed = migrated.some((t, i) => t.html !== parsed[i].html);
      if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch { /* ignore */ }
  const seed: LayoutTemplate = {
    id: makeId(),
    name: "Facebook Posts",
    html: FACEBOOK_POSTS_HTML,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([seed]));
  return [seed];
}

function persist(templates: LayoutTemplate[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function useLayoutTemplates() {
  const [templates, setTemplates] = useState<LayoutTemplate[]>(() => loadFromStorage());

  const createTemplate = useCallback((data: Omit<LayoutTemplate, "id" | "createdAt">) => {
    const created: LayoutTemplate = { ...data, id: makeId(), createdAt: new Date().toISOString() };
    setTemplates((prev) => {
      const next = [created, ...prev];
      persist(next);
      return next;
    });
    return created;
  }, []);

  const updateTemplate = useCallback((id: string, patch: Partial<Omit<LayoutTemplate, "id" | "createdAt">>) => {
    setTemplates((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
      persist(next);
      return next;
    });
  }, []);

  const deleteTemplate = useCallback((id: string) => {
    setTemplates((prev) => {
      const next = prev.filter((t) => t.id !== id);
      persist(next);
      return next;
    });
  }, []);

  return { templates, createTemplate, updateTemplate, deleteTemplate };
}
