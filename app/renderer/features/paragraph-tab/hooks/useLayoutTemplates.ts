import { useState, useCallback } from "react";
import type { LayoutTemplate } from "../types";

const STORAGE_KEY = "layout-templates";

// ── Default "Facebook Posts" template ────────────────────────────────────────
// Designed for 1080 px wide output. Use inline styles so it renders correctly
// in any capture context. {{field}} tokens are replaced at render time.
export const FACEBOOK_POSTS_HTML = `<div style="width:1080px;height:1920px;background:linear-gradient(180deg,#E9EBEE,#D8DADF);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;flex-direction:column;padding:80px 40px 60px;gap:28px;box-sizing:border-box;overflow:hidden;">
  <div style="background:rgba(255,255,255,0.92);border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,0.18);padding:36px 52px;box-sizing:border-box;">

    <div style="display:flex;align-items:center;gap:18px;margin-bottom:22px;">
      <img src="{{profileImage}}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;background:#BEC3C9;flex-shrink:0;" />
      <div style="min-width:0;flex:1;">
        <div style="font-weight:700;font-size:30px;color:#050505;line-height:1.2;">{{profileName}}</div>
        <div style="font-size:22px;color:#65676B;margin-top:6px;">{{postDate}} · 🌐</div>
      </div>
    </div>

    <div style="font-size:32px;line-height:1.65;color:#050505;margin-bottom:14px;word-wrap:break-word;overflow-wrap:break-word;">{{text}}</div>

    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;color:#65676B;font-size:20px;border-bottom:1px solid #E4E6EB;margin-bottom:10px;">
      <span>👍 ❤️  {{likeCount}}</span>
      <span>{{commentCount}} Comments · {{shareCount}} Shares</span>
    </div>

    <div style="display:flex;justify-content:space-around;padding:12px 0;color:#65676B;font-size:20px;font-weight:600;">
      <span>👍 Like</span>
      <span>💬 Comment</span>
      <span>↗ Share</span>
    </div>

  </div>

  <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
    <div style="font-size:28px;font-weight:700;color:#1877F2;letter-spacing:0.2px;">{{readMoreText}}</div>
    <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#1877F2" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
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
