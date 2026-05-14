import { useState, useCallback } from "react";
import { Loader2, Sparkles, Eye, EyeOff, AlertCircle, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/renderer/components/ui/select";
import type { WritingStyle } from "../types";
import { useWritingStyles } from "../hooks/useWritingStyles";
import WritingStyleFormModal from "./WritingStyleFormModal";
import { countWordsInPost, isQueueablePost } from "../utils/postValidation";

interface AIGeneratePanelProps {
  onGenerate: (posts: string[]) => void;
  disabled?: boolean;
}

// ── Providers ─────────────────────────────────────────────────────────────
const PROVIDERS = [
  {
    id: "groq",
    label: "Groq · Llama 3 (Free)",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.1-8b-instant",
    keyPlaceholder: "gsk_…",
    keyHint: "Free key at console.groq.com",
    storageKey: "groq-key",
  },
  {
    id: "openai",
    label: "OpenAI · GPT-4o mini",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    keyPlaceholder: "sk-…",
    keyHint: "Key at platform.openai.com",
    storageKey: "oai-key",
  },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

const SYSTEM_PROMPT =
  "You are a viral Facebook post writer. Write exactly the requested number of posts. " +
  "Separate each post with one blank line. " +
  "Use HTML span tags for emphasis exactly as specified. " +
  "Respect the requested maximum word count for every post. " +
  "Never output a placeholder instead of a post (no line that is only dashes, underscores, or punctuation). " +
  "Return ONLY the posts — no numbering, no labels, no preamble.";

function trimTextToWordLimit(text: string, remaining: { value: number }): string {
  const tokens = text.match(/\s+|\S+/g) ?? [];
  let out = "";

  for (const token of tokens) {
    if (/^\s+$/.test(token)) {
      if (out && remaining.value > 0) out += token;
      continue;
    }

    if (remaining.value <= 0) break;
    out += token;
    remaining.value -= 1;
  }

  return out.trimEnd();
}

function trimNodeToWordLimit(node: Node, remaining: { value: number }): void {
  if (node.nodeType === Node.TEXT_NODE) {
    node.textContent = trimTextToWordLimit(node.textContent ?? "", remaining);
    return;
  }

  for (const child of Array.from(node.childNodes)) {
    if (remaining.value <= 0) {
      child.remove();
      continue;
    }
    trimNodeToWordLimit(child, remaining);
  }
}

function enforceWordLimit(html: string, maxWords: number): string {
  const limit = Math.max(1, Math.floor(maxWords));
  if (countWordsInPost(html) <= limit) return html.trim();

  const template = document.createElement("template");
  template.innerHTML = html.trim();
  trimNodeToWordLimit(template.content, { value: limit });
  return template.innerHTML.trim();
}

function friendlyError(status: number, msg: string, providerLabel: string): string {
  if (status === 401) return `Invalid API key — double-check your ${providerLabel} key.`;
  if (status === 429)
    return `Quota exceeded on ${providerLabel}. Check your billing / usage limits, or switch to a different provider.`;
  if (status === 503 || status === 502) return `${providerLabel} is temporarily unavailable. Try again in a moment.`;
  return msg || `API error ${status}`;
}

async function callAI(
  provider: ProviderId,
  apiKey: string,
  style: WritingStyle,
  count: number,
): Promise<string[]> {
  const prov = PROVIDERS.find((p) => p.id === provider)!;
  const wordLimit = Math.max(1, Math.floor(style.wordCount));
  const userPrompt = style.prompt
    .replace(/\{count\}/g, String(count))
    .replace(/\{wordCount\}/g, String(wordLimit)) +
    `\n\nHard limit: each post must be ${wordLimit} words or fewer. Do not exceed this word count.`;

  const res = await fetch(`${prov.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: prov.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.85,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(friendlyError(res.status, body?.error?.message ?? "", prov.label));
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const content = data.choices?.[0]?.message?.content ?? "";

  return content
    .split(/\n{2,}/)
    .map((p) => p.replace(/^\d+[.)]\s*/, "").trim())
    .map((p) => enforceWordLimit(p, wordLimit))
    .filter((p) => isQueueablePost(p));
}

// ── Component ─────────────────────────────────────────────────────────────

const inputCls =
  "flex h-8 w-full rounded-md border border-border bg-background px-3 text-xs " +
  "text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

export default function AIGeneratePanel({ onGenerate, disabled }: AIGeneratePanelProps) {
  const { styles, createStyle, updateStyle, deleteStyle } = useWritingStyles();

  const [provider, setProvider] = useState<ProviderId>(
    () => (localStorage.getItem("ai-provider") as ProviderId | null) ?? "groq",
  );
  const [apiKeys, setApiKeys] = useState<Partial<Record<ProviderId, string>>>(() => ({
    groq: localStorage.getItem("groq-key") ?? "",
    openai: localStorage.getItem("oai-key") ?? "",
  }));
  const [showKey, setShowKey] = useState(false);
  const [count, setCount] = useState(() => Number(localStorage.getItem("ai-count") || "5"));

  // Selected style — persist by ID; fall back to first style
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(
    () => localStorage.getItem("ai-skill"),
  );
  const selectedStyle = styles.find((s) => s.id === selectedStyleId) ?? styles[0] ?? null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Style modal
  const [styleModalOpen, setStyleModalOpen] = useState(false);
  const [editingStyle, setEditingStyle] = useState<WritingStyle | null>(null);

  const currentKey = apiKeys[provider] ?? "";
  const currentProv = PROVIDERS.find((p) => p.id === provider)!;

  const setKey = useCallback((val: string) => {
    setApiKeys((prev) => ({ ...prev, [provider]: val }));
    const storageKey = PROVIDERS.find((p) => p.id === provider)?.storageKey;
    if (storageKey) {
      if (val) localStorage.setItem(storageKey, val);
      else localStorage.removeItem(storageKey);
    }
  }, [provider]);

  const handleProviderChange = useCallback((val: string) => {
    setProvider(val as ProviderId);
    localStorage.setItem("ai-provider", val);
    setError(null);
    setShowKey(false);
  }, []);

  const handleStyleSelect = useCallback((id: string) => {
    setSelectedStyleId(id);
    localStorage.setItem("ai-skill", id);
  }, []);

  const handleStyleSave = useCallback(
    (data: Omit<WritingStyle, "id" | "createdAt">) => {
      if (editingStyle) {
        updateStyle(editingStyle.id, data);
      } else {
        const created = createStyle(data);
        handleStyleSelect(created.id);
      }
      setStyleModalOpen(false);
      setEditingStyle(null);
    },
    [editingStyle, updateStyle, createStyle, handleStyleSelect],
  );

  const handleStyleDelete = useCallback(() => {
    if (!editingStyle) return;
    deleteStyle(editingStyle.id);
    if (selectedStyleId === editingStyle.id) {
      const remaining = styles.filter((s) => s.id !== editingStyle.id);
      const next = remaining[0] ?? null;
      setSelectedStyleId(next?.id ?? null);
      if (next) localStorage.setItem("ai-skill", next.id);
      else localStorage.removeItem("ai-skill");
    }
    setStyleModalOpen(false);
    setEditingStyle(null);
  }, [editingStyle, deleteStyle, selectedStyleId, styles]);

  const handleGenerate = useCallback(async () => {
    if (!currentKey.trim()) { setError("Enter your API key."); return; }
    if (!selectedStyle)     { setError("Select a writing style."); return; }
    setError(null);
    setLoading(true);
    try {
      const posts = await callAI(provider, currentKey.trim(), selectedStyle, count);
      if (posts.length === 0) throw new Error("No posts returned — try again.");
      onGenerate(posts);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [provider, currentKey, selectedStyle, count, onGenerate]);

  const isLocked = disabled || loading;

  return (
    <div className="flex flex-col gap-5">

      {/* ── Provider + API key ── */}
      <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-foreground/70">Provider</label>
        <Select value={provider} onValueChange={handleProviderChange} disabled={isLocked}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map((p) => (
              <SelectItem key={p.id} value={p.id} className="text-xs">
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* API key */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-foreground/70">API key</label>
        <div className="flex gap-1.5">
          <input
            type={showKey ? "text" : "password"}
            value={currentKey}
            onChange={(e) => setKey(e.target.value)}
            placeholder={currentProv.keyPlaceholder}
            disabled={isLocked}
            className={cn(inputCls, "flex-1 font-mono text-[11px]")}
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            disabled={isLocked}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background hover:bg-muted transition-colors"
            aria-label={showKey ? "Hide key" : "Show key"}
          >
            {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">{currentProv.keyHint} · Stored locally.</p>
      </div>
      </div>

      {/* ── Writing style + count + generate ── */}
      <div className="flex flex-col gap-3 border-t border-border pt-4">
      {/* Writing style + count */}
      <div className="flex items-end gap-3">
      <div className="flex flex-1 flex-col gap-1.5">
        <label className="text-xs font-medium text-foreground/70">Writing style</label>
        <div className="flex gap-1.5">
          <Select
            value={selectedStyle?.id ?? ""}
            onValueChange={handleStyleSelect}
            disabled={isLocked}
          >
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue placeholder="Select a style…" />
            </SelectTrigger>
            <SelectContent>
              {styles.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedStyle && (
            <button
              type="button"
              onClick={() => { setEditingStyle(selectedStyle); setStyleModalOpen(true); }}
              disabled={isLocked}
              title="Edit style"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
          )}

          <button
            type="button"
            onClick={() => { setEditingStyle(null); setStyleModalOpen(true); }}
            disabled={isLocked}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/60 px-2.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            New
          </button>
        </div>
      </div>

      <div className="flex w-20 shrink-0 flex-col gap-1.5">
        <label className="text-xs font-medium text-foreground/70">Count</label>
        <input
          type="number"
          min={1}
          max={20}
          value={count}
          onChange={(e) => {
            const v = Math.min(20, Math.max(1, Number(e.target.value) || 1));
            setCount(v);
            localStorage.setItem("ai-count", String(v));
          }}
          disabled={isLocked}
          className={inputCls}
        />
      </div>
      </div>

      {/* Word count readout */}
      {selectedStyle && (
        <p className="text-[10px] text-muted-foreground">
          Max {selectedStyle.wordCount} words per post
        </p>
      )}

      {/* Generate button */}
      <button
        type="button"
        onClick={!isLocked ? () => void handleGenerate() : undefined}
        disabled={isLocked || !currentKey.trim() || !selectedStyle}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors",
          "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isLocked || !currentKey.trim() || !selectedStyle
            ? "cursor-not-allowed border-border bg-muted text-muted-foreground opacity-70"
            : "cursor-pointer border-violet-500/60 bg-violet-500/10 text-violet-700 dark:text-violet-300 hover:bg-violet-500/20",
        )}
      >
        {loading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Sparkles className="h-3.5 w-3.5" />}
        {loading ? "Generating…" : "Generate Posts"}
      </button>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-xs text-destructive leading-relaxed">{error}</p>
        </div>
      )}
      </div>

      {/* Writing style modal */}
      <WritingStyleFormModal
        open={styleModalOpen}
        style={editingStyle}
        onSave={handleStyleSave}
        onDelete={editingStyle ? handleStyleDelete : undefined}
        onClose={() => { setStyleModalOpen(false); setEditingStyle(null); }}
      />
    </div>
  );
}
