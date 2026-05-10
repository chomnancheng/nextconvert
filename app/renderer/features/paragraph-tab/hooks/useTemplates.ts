import { useState, useCallback, useEffect } from "react";
import type { Template } from "../types";

function makeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function useTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electronAPI
      .getTemplates()
      .then((t) => {
        setTemplates(t);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const persist = useCallback((next: Template[]) => {
    void window.electronAPI.saveTemplates(next);
  }, []);

  const createTemplate = useCallback(
    (data: Omit<Template, "id" | "createdAt">) => {
      const created: Template = {
        ...data,
        id: makeId(),
        createdAt: new Date().toISOString(),
      };
      setTemplates((prev) => {
        const next = [created, ...prev];
        persist(next);
        return next;
      });
      return created;
    },
    [persist],
  );

  const updateTemplate = useCallback(
    (id: string, patch: Partial<Omit<Template, "id" | "createdAt">>) => {
      setTemplates((prev) => {
        const next = prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const deleteTemplate = useCallback(
    (id: string) => {
      setTemplates((prev) => {
        const next = prev.filter((t) => t.id !== id);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return { templates, loading, createTemplate, updateTemplate, deleteTemplate };
}
