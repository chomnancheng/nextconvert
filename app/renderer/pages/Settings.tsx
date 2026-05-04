import React from "react";
import { Separator } from "@/renderer/components/ui/separator";
import { Label } from "@/renderer/components/ui/label";
import { Input } from "@/renderer/components/ui/input";
import { Textarea } from "@/renderer/components/ui/textarea";
import { Slider } from "@/renderer/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/renderer/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  Settings,
  SizePreset,
  WatermarkPosition,
  MusicSettings,
  WatermarkSettings,
  MetadataSettings,
} from "@/renderer/hooks/useSettings";
import { PRESET_LABELS } from "@/renderer/hooks/useSettings";
import { FolderOpen, Music2, AlertTriangle } from "lucide-react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SettingsPanelProps {
  settings: Settings;
  onPreset: (v: SizePreset) => void;
  onDuration: (v: number) => void;
  onQuality: (v: number) => void;
  onWatermark: (patch: Partial<WatermarkSettings>) => void;
  onMusic: (patch: Partial<MusicSettings>) => void;
  onMetadata: (patch: Partial<MetadataSettings>) => void;
  onOutputDir: (v: string) => void;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Layout atoms
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
      {children}
    </p>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-foreground/70">
        {label}
      </Label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SettingsPanel({
  settings,
  onPreset,
  onDuration,
  onQuality,
  onWatermark,
  onMusic,
  onMetadata,
  onOutputDir,
  disabled = false,
}: SettingsPanelProps) {
  const { watermark, music, metadata } = settings;

  // ── IPC helpers ────────────────────────────────────────────────────────

  const handleBrowseMusicFolder = async () => {
    const dir = await window.electronAPI.pickFolder();
    if (!dir) return;
    const result = await window.electronAPI.scanMusicFolder(dir);
    onMusic({ folderPath: dir, files: result.files, fileCount: result.count });
  };

  const handleBrowseOutputDir = async () => {
    const dir = await window.electronAPI.pickFolder();
    if (dir) onOutputDir(dir);
  };

  const handleBrowseWatermarkImage = async () => {
    const paths = await window.electronAPI.openFiles();
    if (paths.length > 0) onWatermark({ imagePath: paths[0] });
  };

  // ── Derived display values ─────────────────────────────────────────────

  const hasMusicFolder = Boolean(music.folderPath);
  const mp3Count = music.files.filter((f) => f.toLowerCase().endsWith(".mp3")).length;
  const mp4Count = music.files.filter((f) => f.toLowerCase().endsWith(".mp4")).length;

  const inputCls = cn("h-8 text-xs", disabled && "opacity-50 pointer-events-none");
  const sliderCls = cn(disabled && "opacity-50 pointer-events-none");
  const iconBtnCls = cn(
    "shrink-0 inline-flex items-center justify-center rounded-md border border-border",
    "bg-background h-8 w-8 hover:bg-muted transition-colors",
    disabled && "opacity-50 pointer-events-none",
  );

  return (
    <div className={cn("flex flex-col gap-5 py-1 pb-6", disabled && "select-none")}>

      {/* ── Output ─────────────────────────────────────────────────────── */}
      <div>
        <SectionTitle>Output</SectionTitle>
        <div className="flex flex-col gap-3">

          <Field label="Size preset" htmlFor="s-preset">
            <Select
              value={settings.preset}
              onValueChange={(v) => onPreset(v as SizePreset)}
              disabled={disabled}
            >
              <SelectTrigger id="s-preset" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(PRESET_LABELS) as [SizePreset, string][]).map(([value, label]) => (
                  <SelectItem key={value} value={value} className="text-xs">{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Output base folder">
            <div className="flex gap-1.5">
              <Input
                value={settings.outputDir}
                onChange={(e) => onOutputDir(e.target.value)}
                placeholder="Same folder as input (auto)"
                className={cn(inputCls, "flex-1 font-mono")}
                disabled={disabled}
              />
              <button type="button" onClick={handleBrowseOutputDir} disabled={disabled} className={iconBtnCls}>
                <FolderOpen className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Videos saved to <span className="font-mono">
                {settings.outputDir || "<input folder>"}
              </span>/converted-YYYY-MM-DD-HHmm/
            </p>
          </Field>

        </div>
      </div>

      <Separator />

      {/* ── Duration ───────────────────────────────────────────────────── */}
      <div>
        <SectionTitle>Duration</SectionTitle>
        <div className="flex flex-col gap-3">

          <Field label={`Video length — ${settings.duration}s`} htmlFor="s-duration">
            <Slider
              id="s-duration"
              min={5}
              max={120}
              step={1}
              value={[settings.duration]}
              onValueChange={([v]) => onDuration(v)}
              disabled={disabled}
              className={sliderCls}
            />
            <p className="text-[11px] text-muted-foreground">
              {settings.duration}s · auto-distributed across images
            </p>
          </Field>

          <Field label={`Quality — ${settings.quality}`} htmlFor="s-quality">
            <Slider
              id="s-quality"
              min={0}
              max={100}
              step={1}
              value={[settings.quality]}
              onValueChange={([v]) => onQuality(v)}
              disabled={disabled}
              className={sliderCls}
            />
            <p className="text-[11px] text-muted-foreground">Higher = better quality, larger file</p>
          </Field>

        </div>
      </div>

      <Separator />

      {/* ── Music ──────────────────────────────────────────────────────── */}
      <div>
        <SectionTitle>Music</SectionTitle>
        <div className="flex flex-col gap-3">

          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={music.enabled}
              onChange={(e) => onMusic({ enabled: e.target.checked })}
              disabled={disabled}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <span className="text-xs font-medium text-foreground">Enable background music</span>
          </label>

          {music.enabled && (
            <>
              <Field label="Audio folder">
                <div className="flex gap-1.5">
                  <Input
                    value={music.folderPath}
                    readOnly
                    placeholder="Select folder with MP3 / MP4…"
                    className={cn(inputCls, "flex-1 font-mono truncate")}
                  />
                  <button type="button" onClick={handleBrowseMusicFolder} disabled={disabled} className={iconBtnCls}>
                    <FolderOpen className="h-3.5 w-3.5" />
                  </button>
                </div>
              </Field>

              {/* File count badge */}
              {hasMusicFolder && (
                <div className={cn(
                  "flex items-start gap-2 rounded-md px-2.5 py-2 text-xs",
                  music.fileCount === 0
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground",
                )}>
                  {music.fileCount === 0 ? (
                    <>
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>No audio files found. Add MP3 or MP4 files to this folder.</span>
                    </>
                  ) : (
                    <>
                      <Music2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        {mp3Count > 0 && `${mp3Count} MP3`}
                        {mp3Count > 0 && mp4Count > 0 && " · "}
                        {mp4Count > 0 && `${mp4Count} MP4`}
                        {" "}file{music.fileCount !== 1 ? "s" : ""}
                        {" · "}random pick per video
                        {" · "}tracks ≥ {settings.duration}s preferred
                      </span>
                    </>
                  )}
                </div>
              )}

              <Field label={`Volume — ${music.volume}%`} htmlFor="s-volume">
                <Slider
                  id="s-volume"
                  min={0}
                  max={100}
                  step={5}
                  value={[music.volume]}
                  onValueChange={([v]) => onMusic({ volume: v })}
                  disabled={disabled}
                  className={sliderCls}
                />
              </Field>
            </>
          )}

        </div>
      </div>

      <Separator />

      {/* ── Watermark ──────────────────────────────────────────────────── */}
      <div>
        <SectionTitle>Watermark</SectionTitle>
        <div className="flex flex-col gap-3">

          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={watermark.enabled}
              onChange={(e) => onWatermark({ enabled: e.target.checked })}
              disabled={disabled}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <span className="text-xs font-medium text-foreground">Enable watermark</span>
          </label>

          {watermark.enabled && (
            <>
              <Field label="Type" htmlFor="s-wm-type">
                <Select
                  value={watermark.type}
                  onValueChange={(v) => onWatermark({ type: v as "text" | "image" })}
                  disabled={disabled}
                >
                  <SelectTrigger id="s-wm-type" className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text" className="text-xs">Text</SelectItem>
                    <SelectItem value="image" className="text-xs">Image</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {watermark.type === "text" ? (
                <Field label="Text" htmlFor="s-wm-text">
                  <Input
                    id="s-wm-text"
                    value={watermark.text}
                    onChange={(e) => onWatermark({ text: e.target.value })}
                    placeholder="e.g. © My Brand"
                    className={inputCls}
                    disabled={disabled}
                  />
                </Field>
              ) : (
                <Field label="Image">
                  <div className="flex gap-1.5">
                    <Input
                      value={watermark.imagePath}
                      readOnly
                      placeholder="No file selected"
                      className={cn(inputCls, "flex-1 font-mono")}
                    />
                    <button type="button" onClick={handleBrowseWatermarkImage} disabled={disabled} className={iconBtnCls}>
                      <FolderOpen className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </Field>
              )}

              <Field label="Position" htmlFor="s-wm-pos">
                <Select
                  value={watermark.position}
                  onValueChange={(v) => onWatermark({ position: v as WatermarkPosition })}
                  disabled={disabled}
                >
                  <SelectTrigger id="s-wm-pos" className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="top-left" className="text-xs">Top left</SelectItem>
                    <SelectItem value="top-right" className="text-xs">Top right</SelectItem>
                    <SelectItem value="bottom-left" className="text-xs">Bottom left</SelectItem>
                    <SelectItem value="bottom-right" className="text-xs">Bottom right</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label={`Opacity — ${watermark.opacity}%`} htmlFor="s-wm-opacity">
                <Slider
                  id="s-wm-opacity"
                  min={10}
                  max={100}
                  step={5}
                  value={[watermark.opacity]}
                  onValueChange={([v]) => onWatermark({ opacity: v })}
                  disabled={disabled}
                  className={sliderCls}
                />
              </Field>
            </>
          )}

        </div>
      </div>

      <Separator />

      {/* ── Metadata ───────────────────────────────────────────────────── */}
      <div>
        <SectionTitle>Metadata</SectionTitle>
        <div className="flex flex-col gap-3">

          <Field label="Title" htmlFor="s-meta-title">
            <Input
              id="s-meta-title"
              value={metadata.title}
              onChange={(e) => onMetadata({ title: e.target.value })}
              placeholder="Video title"
              className={inputCls}
              disabled={disabled}
            />
          </Field>

          <Field label="Author" htmlFor="s-meta-author">
            <Input
              id="s-meta-author"
              value={metadata.author}
              onChange={(e) => onMetadata({ author: e.target.value })}
              placeholder="Your name or brand"
              className={inputCls}
              disabled={disabled}
            />
          </Field>

          <Field label="Description" htmlFor="s-meta-desc">
            <Textarea
              id="s-meta-desc"
              value={metadata.description}
              onChange={(e) => onMetadata({ description: e.target.value })}
              placeholder="Short description"
              rows={3}
              className={cn("text-xs resize-none", disabled && "opacity-50 pointer-events-none")}
              disabled={disabled}
            />
          </Field>

        </div>
      </div>

    </div>
  );
}
