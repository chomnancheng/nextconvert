import { useState, useEffect, useCallback } from "react";
import { Loader2, Sparkles, Eye, EyeOff, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/renderer/components/ui/select";

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

// ── Writing styles ────────────────────────────────────────────────────────
const SKILLS = [
  {
    id: "mystery",
    label: "Mystery / Suspense",
    userPrompt:
      'Generate {count} mysterious suspenseful Facebook posts. Begin each with a bold red label: <span style="color:#e60023;font-weight:bold;">MYSTERY:</span> or <span style="color:#e60023;font-weight:bold;">SHOCKING:</span>. Build intrigue and end with an unsettling reveal or open question. 3-5 sentences each. Separate posts with a blank line.',
  },
  {
    id: "family",
    label: "Family Story",
    userPrompt:
      'Generate {count} heartwarming Facebook posts about relatable family moments. Each tells a brief emotional story. Bold key emotional phrases: <span style="font-weight:bold;">phrase</span>. 3-4 sentences each. Separate posts with a blank line.',
  },
  {
    id: "drama",
    label: "Social Drama",
    userPrompt:
      'Generate {count} engaging Facebook posts about relatable social drama. Feel authentic, build curiosity. Highlight shocking moments with <span style="color:#e60023;font-weight:bold;">red bold text</span>. 2-4 sentences each. Separate posts with a blank line.',
  },
  {
    id: "readmore",
    label: "Hook (Read More)",
    userPrompt:
      'Generate {count} Facebook posts that make readers desperate to click "See More". Open with a bold hook: <span style="font-weight:bold;">hook phrase</span>. Build suspense that ends in a cliffhanger. 3-5 sentences each. Separate posts with a blank line.',
  },
] as const;

type SkillId = (typeof SKILLS)[number]["id"];

const SYSTEM_PROMPT =
  "You are a viral Facebook post writer. Write exactly the requested number of posts. " +
  "Separate each post with one blank line. " +
  "Use HTML span tags for emphasis exactly as specified. " +
  "Return ONLY the posts — no numbering, no labels, no preamble.";

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
  skill: SkillId,
  count: number,
): Promise<string[]> {
  const prov = PROVIDERS.find((p) => p.id === provider)!;
  const skillDef = SKILLS.find((s) => s.id === skill)!;
  const userPrompt = skillDef.userPrompt.replace("{count}", String(count));

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
    .filter((p) => p.length > 20);
}

// ── Component ─────────────────────────────────────────────────────────────

const inputCls =
  "flex h-8 w-full rounded-md border border-border bg-background px-3 text-xs " +
  "text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

export default function AIGeneratePanel({ onGenerate, disabled }: AIGeneratePanelProps) {
  const [provider, setProvider] = useState<ProviderId>("groq");
  const [apiKeys, setApiKeys] = useState<Partial<Record<ProviderId, string>>>(() => ({
    groq: localStorage.getItem("groq-key") ?? "",
    openai: localStorage.getItem("oai-key") ?? "",
  }));
  const [showKey, setShowKey] = useState(false);
  const [count, setCount] = useState(5);
  const [skill, setSkill] = useState<SkillId>("mystery");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentKey = apiKeys[provider] ?? "";
  const currentProv = PROVIDERS.find((p) => p.id === provider)!;

  // Persist keys per provider
  useEffect(() => {
    const storageKey = PROVIDERS.find((p) => p.id === provider)?.storageKey;
    if (!storageKey) return;
    if (currentKey) localStorage.setItem(storageKey, currentKey);
    else localStorage.removeItem(storageKey);
  }, [provider, currentKey]);

  const setKey = useCallback((val: string) => {
    setApiKeys((prev) => ({ ...prev, [provider]: val }));
  }, [provider]);

  const handleProviderChange = useCallback((val: string) => {
    setProvider(val as ProviderId);
    setError(null);
    setShowKey(false);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!currentKey.trim()) { setError("Enter your API key."); return; }
    setError(null);
    setLoading(true);
    try {
      const posts = await callAI(provider, currentKey.trim(), skill, count);
      if (posts.length === 0) throw new Error("No posts returned — try again.");
      onGenerate(posts);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [provider, currentKey, skill, count, onGenerate]);

  const isLocked = disabled || loading;

  return (
    <div className="flex flex-col gap-3">
      {/* Provider */}
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

      {/* Style + count */}
      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-xs font-medium text-foreground/70">Writing style</label>
          <Select value={skill} onValueChange={(v) => setSkill(v as SkillId)} disabled={isLocked}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SKILLS.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex w-20 flex-col gap-1.5">
          <label className="text-xs font-medium text-foreground/70">Count</label>
          <input
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) =>
              setCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))
            }
            disabled={isLocked}
            className={inputCls}
          />
        </div>
      </div>

      {/* Generate button */}
      <button
        type="button"
        onClick={!isLocked ? () => void handleGenerate() : undefined}
        disabled={isLocked || !currentKey.trim()}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors",
          "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isLocked || !currentKey.trim()
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
  );
}
