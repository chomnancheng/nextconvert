import { useState, useCallback } from "react";
import type { WritingStyle } from "../types";

const STORAGE_KEY = "writing-styles";

const SEED_STYLES: Omit<WritingStyle, "id" | "createdAt">[] = [
  {
    name: "Mystery / Suspense",
    wordCount: 100,
    prompt:
      'Generate {count} mysterious suspenseful Facebook posts. Begin each with a bold red label: <span style="color:#e60023;font-weight:bold;">MYSTERY:</span> or <span style="color:#e60023;font-weight:bold;">SHOCKING:</span>. Build intrigue layer by layer, add an unexpected mid-story twist, and end with an unsettling reveal or open question that leaves readers uneasy. 4-6 sentences, around {wordCount} words each. Separate posts with a blank line.',
  },
  {
    name: "Family Story",
    wordCount: 100,
    prompt:
      'Generate {count} heartwarming Facebook posts about deeply relatable family moments. Each tells a vivid emotional story with a surprising turn that hits close to home. Bold key emotional phrases: <span style="font-weight:bold;">phrase</span>. Build up slowly then land a touching or bittersweet final line that lingers. 4-6 sentences, around {wordCount} words each. Separate posts with a blank line.',
  },
  {
    name: "Social Drama",
    wordCount: 100,
    prompt:
      'Generate {count} gripping Facebook posts about real-feeling social drama. Open with a line so provocative readers cannot scroll past. Build tension sentence by sentence, highlight the most shocking moment with <span style="color:#e60023;font-weight:bold;">red bold text</span>, and end right before the resolution so readers desperately want to see more. Include raw emotion and vivid detail. 4-6 sentences, around {wordCount} words each. Separate posts with a blank line.',
  },
  {
    name: "Hook (Read More)",
    wordCount: 100,
    prompt:
      'Generate {count} Facebook posts engineered to make readers desperate to click "See More". Open with an irresistible bold hook: <span style="font-weight:bold;">hook phrase</span>. Layer in rising suspense with each sentence, drop a shocking detail in the middle, then cut off at the most unbearable cliffhanger. The reader must feel they cannot stop now. 4-6 sentences, around {wordCount} words each. Separate posts with a blank line.',
  },
];

function makeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function loadFromStorage(): WritingStyle[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WritingStyle[];
      if (parsed.length > 0) {
        // Migrate old minWords field to wordCount
        return parsed.map((s) => ({
          ...s,
          wordCount: s.wordCount ?? (s as unknown as Record<string, number>)["wordCount"] ?? 90,
        }));
      }
    }
  } catch { /* ignore */ }
  const seeded = SEED_STYLES.map((s) => ({
    ...s,
    id: makeId(),
    createdAt: new Date().toISOString(),
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

function persist(styles: WritingStyle[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(styles));
}

export function useWritingStyles() {
  const [styles, setStyles] = useState<WritingStyle[]>(() => loadFromStorage());

  const createStyle = useCallback((data: Omit<WritingStyle, "id" | "createdAt">) => {
    const created: WritingStyle = { ...data, id: makeId(), createdAt: new Date().toISOString() };
    setStyles((prev) => {
      const next = [created, ...prev];
      persist(next);
      return next;
    });
    return created;
  }, []);

  const updateStyle = useCallback((id: string, patch: Partial<Omit<WritingStyle, "id" | "createdAt">>) => {
    setStyles((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...patch } : s));
      persist(next);
      return next;
    });
  }, []);

  const deleteStyle = useCallback((id: string) => {
    setStyles((prev) => {
      const next = prev.filter((s) => s.id !== id);
      persist(next);
      return next;
    });
  }, []);

  return { styles, createStyle, updateStyle, deleteStyle };
}
