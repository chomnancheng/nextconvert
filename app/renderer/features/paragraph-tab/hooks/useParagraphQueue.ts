import { useState, useCallback } from "react";
import type { ParagraphQueueItem } from "../types";

export function useParagraphQueue() {
  const [items, setItems] = useState<ParagraphQueueItem[]>([]);
  const [rawText, setRawText] = useState("");

  const importText = useCallback((text: string) => {
    setRawText(text);
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // Keep raw text (may contain HTML) — canvas renderer handles styled parsing
    setItems(
      lines.map((line, idx) => ({
        id: `para_${idx}_${Math.random().toString(36).slice(2)}`,
        text: line,
        lineNumber: idx + 1,
      })),
    );
  }, []);

  const appendItems = useCallback((lines: string[]) => {
    setItems((prev) => {
      const filtered = lines.filter((l) => l.trim().length > 0);
      const start = prev.length;
      return [
        ...prev,
        ...filtered.map((line, idx) => ({
          id: `para_ai_${start + idx}_${Math.random().toString(36).slice(2)}`,
          text: line,
          lineNumber: start + idx + 1,
        })),
      ];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
    setRawText("");
  }, []);

  return { items, rawText, setRawText, importText, appendItems, removeItem, clearAll };
}
