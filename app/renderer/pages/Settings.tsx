import React from "react";
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
  EncoderMode,
  EncoderOption,
  WatermarkPosition,
  MusicSettings,
  VideoBgSettings,
  WatermarkSettings,
  MetadataSettings,
  PhotoFitMode,
} from "@/renderer/hooks/useSettings";
import { PRESET_LABELS, PHOTO_FIT_LABELS } from "@/renderer/hooks/useSettings";
import { FolderOpen, Music2, Film, AlertTriangle, ChevronDown } from "lucide-react";

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
  onVideoBg: (patch: Partial<VideoBgSettings>) => void;
  onMetadata: (patch: Partial<MetadataSettings>) => void;
  onOutputDir: (v: string) => void;
  onEncoder: (v: EncoderMode) => void;
  onPhotoFit: (v: PhotoFitMode) => void;
  onConcurrentJobs: (v: number) => void;
  onCustomSize: (patch: { customWidth?: number; customHeight?: number }) => void;
  onResetDefaults: () => void;
  encoderOptions: EncoderOption[];
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Layout atoms
// ---------------------------------------------------------------------------

const SETTINGS_GROUP_IDS = [
  "settings-output",
  "settings-encoding",
  "settings-audio-visual",
  "settings-watermark",
  "settings-metadata",
] as const;

type SettingsGroupId = (typeof SETTINGS_GROUP_IDS)[number];

function CollapseGroup({
  groupId,
  title,
  open,
  onToggle,
  children,
}: {
  groupId: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div data-settings-group={groupId} className="rounded-md border border-border overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${groupId}-panel`}
        id={`${groupId}-trigger`}
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-muted/60 transition-colors"
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </span>
      </button>
      {open && (
        <div
          id={`${groupId}-panel`}
          role="region"
          aria-labelledby={`${groupId}-trigger`}
          className="flex flex-col gap-3 border-t border-border px-2.5 pb-3 pt-2.5"
        >
          {children}
        </div>
      )}
    </div>
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

function normalizeHexOverlay(raw: string): string | null {
  const m = /^#?([0-9A-Fa-f]{6})$/.exec(raw.trim());
  return m ? `#${m[1].toUpperCase()}` : null;
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
  onVideoBg,
  onMetadata,
  onOutputDir,
  onEncoder,
  onPhotoFit,
  onConcurrentJobs,
  onCustomSize,
  onResetDefaults,
  encoderOptions,
  disabled = false,
}: SettingsPanelProps) {
  const { watermark, music, videoBg, metadata } = settings;

  const overlayHex = videoBg.overlayColor ?? "#000000";
  const [hexDraft, setHexDraft] = React.useState(overlayHex);
  React.useEffect(() => {
    setHexDraft(overlayHex);
  }, [overlayHex]);

  const commitHexOverlay = () => {
    const n = normalizeHexOverlay(hexDraft);
    if (n) onVideoBg({ overlayColor: n });
    else setHexDraft(overlayHex);
  };

  // ── IPC helpers ────────────────────────────────────────────────────────

  const handleBrowseMusicFolder = async () => {
    const dir = await window.electronAPI.pickFolder();
    if (!dir) return;
    const result = await window.electronAPI.scanMusicFolder(dir);
    onMusic({ folderPath: dir, files: result.files, fileCount: result.count });
  };

  const handleBrowseVideoBgFolder = async () => {
    const dir = await window.electronAPI.pickFolder();
    if (!dir) return;
    const result = await window.electronAPI.scanVideoBgFolder(dir);
    const videoBgResult = result as typeof result & { folderPath?: string; totalFiles?: number };
    onVideoBg({
      folderPath: videoBgResult.folderPath ?? dir,
      files: result.files,
      fileCount: result.count,
      totalFiles: videoBgResult.totalFiles ?? result.count,
    });
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

  const [openGroups, setOpenGroups] = React.useState<Record<SettingsGroupId, boolean>>(() =>
    Object.fromEntries(SETTINGS_GROUP_IDS.map((id) => [id, false])) as Record<SettingsGroupId, boolean>,
  );

  const toggleGroup = (id: SettingsGroupId) => {
    setOpenGroups((s) => ({ ...s, [id]: !s[id] }));
  };

  const collapseAllGroups = () => {
    setOpenGroups(Object.fromEntries(SETTINGS_GROUP_IDS.map((id) => [id, false])) as Record<SettingsGroupId, boolean>);
  };

  const expandAllGroups = () => {
    setOpenGroups(Object.fromEntries(SETTINGS_GROUP_IDS.map((id) => [id, true])) as Record<SettingsGroupId, boolean>);
  };

  return (
    <div className={cn("flex flex-col gap-2 py-1 pb-6", disabled && "select-none")}>
      <p className="text-[11px] text-muted-foreground -mb-1">
        Settings save automatically when you change them.
      </p>

      <div className="flex flex-wrap gap-1.5 -mt-0.5 mb-0.5">
        <button
          type="button"
          disabled={disabled}
          onClick={collapseAllGroups}
          className={cn(
            "rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground",
            "hover:bg-muted hover:text-foreground transition-colors",
            disabled && "opacity-50 pointer-events-none",
          )}
        >
          Collapse all
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={expandAllGroups}
          className={cn(
            "rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground",
            "hover:bg-muted hover:text-foreground transition-colors",
            disabled && "opacity-50 pointer-events-none",
          )}
        >
          Expand all
        </button>
      </div>

      <CollapseGroup
        groupId="settings-output"
        title="Output"
        open={openGroups["settings-output"]}
        onToggle={() => toggleGroup("settings-output")}
      >
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
          {settings.preset === "custom" && (
            <Field label="Custom size (W × H)">
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={64}
                  max={7680}
                  value={settings.customWidth}
                  onChange={(e) => onCustomSize({ customWidth: Number(e.target.value) || 64 })}
                  className={cn(inputCls, "w-24")}
                  disabled={disabled}
                />
                <span className="text-xs text-muted-foreground">×</span>
                <Input
                  type="number"
                  min={64}
                  max={7680}
                  value={settings.customHeight}
                  onChange={(e) => onCustomSize({ customHeight: Number(e.target.value) || 64 })}
                  className={cn(inputCls, "w-24")}
                  disabled={disabled}
                />
              </div>
            </Field>
          )}

          <Field label="Encoder / GPU" htmlFor="s-encoder">
            <Select
              value={settings.encoder}
              onValueChange={(v) => onEncoder(v as EncoderMode)}
              disabled={disabled}
            >
              <SelectTrigger id="s-encoder" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {encoderOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Use CPU for maximum compatibility if GPU encoding fails.
            </p>
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
              </span>/converted/
            </p>
          </Field>

      </CollapseGroup>

      <CollapseGroup
        groupId="settings-encoding"
        title="Encoding"
        open={openGroups["settings-encoding"]}
        onToggle={() => toggleGroup("settings-encoding")}
      >
          <Field label="Picture layout" htmlFor="s-photofit">
            <Select
              value={settings.photoFit}
              onValueChange={(v) => onPhotoFit(v as PhotoFitMode)}
              disabled={disabled}
            >
              <SelectTrigger id="s-photofit" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(PHOTO_FIT_LABELS) as [PhotoFitMode, string][]).map(([value, label]) => (
                  <SelectItem key={value} value={value} className="text-xs">{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Applies to still-image reels and to the photo over a video background.
            </p>
          </Field>

          <Field label="Parallel conversions" htmlFor="s-concurrent">
            <div className="flex items-center gap-2">
              <Input
                id="s-concurrent"
                type="number"
                min={1}
                max={8}
                value={settings.concurrentJobs}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isNaN(v)) onConcurrentJobs(v);
                }}
                className={cn(inputCls, "w-14 tabular-nums")}
                disabled={disabled}
              />
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">1–8 at once</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Higher uses more CPU/GPU while converting a batch.
            </p>
          </Field>

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

      </CollapseGroup>

      <CollapseGroup
        groupId="settings-audio-visual"
        title="Music & video background"
        open={openGroups["settings-audio-visual"]}
        onToggle={() => toggleGroup("settings-audio-visual")}
      >

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

          <div className="space-y-3 border-t border-border pt-3 mt-3">

          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={videoBg.enabled}
              onChange={(e) => onVideoBg({ enabled: e.target.checked })}
              disabled={disabled}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <span className="text-xs font-medium text-foreground">Enable video background</span>
          </label>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Random clip from this folder as background video. That clip&apos;s audio is never used — only tracks from Music above play when Music is enabled. Framing follows <span className="font-medium text-foreground/80">Picture layout</span> in Encoding; use max % below so opaque photos don&apos;t cover all of the clip, or use 100% when you want a full-area frame.
          </p>

          {videoBg.enabled && (
            <>
              <Field label="Video folder">
                <div className="flex gap-1.5">
                  <Input
                    value={videoBg.folderPath}
                    readOnly
                    placeholder="Select folder with MP4 / MOV…"
                    className={cn(inputCls, "flex-1 font-mono truncate")}
                  />
                  <button type="button" onClick={handleBrowseVideoBgFolder} disabled={disabled} className={iconBtnCls}>
                    <FolderOpen className="h-3.5 w-3.5" />
                  </button>
                </div>
              </Field>

              {videoBg.folderPath && (
                <div className={cn(
                  "flex items-start gap-2 rounded-md px-2.5 py-2 text-xs",
                  videoBg.fileCount === 0
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground",
                )}>
                  {videoBg.fileCount === 0 ? (
                    <>
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <div className="flex flex-col gap-1.5">
                        <span>
                          {videoBg.totalFiles > 0
                            ? `Found ${videoBg.totalFiles} file${videoBg.totalFiles !== 1 ? "s" : ""} but none are supported formats. Supported: MP4, MOV, MKV, AVI, WebM, M4V.`
                            : videoBg.totalFiles === -2
                              ? "This saved folder no longer exists. Pick the video folder again using the folder icon."
                            : videoBg.totalFiles === -1
                              ? "macOS blocked access to this folder. Pick the folder again using the folder icon to re-grant access, or grant Full Disk Access below."
                              : "No video files found. Add MP4, MOV, MKV or AVI files to this folder."}
                        </span>
                        {videoBg.totalFiles === -1 && (
                          <button
                            type="button"
                            onClick={() => void window.electronAPI.openPrivacySettings()}
                            className="self-start rounded px-2 py-0.5 text-[10px] font-medium bg-destructive/20 hover:bg-destructive/30 transition-colors"
                          >
                            Open Privacy &amp; Security Settings →
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <Film className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        {videoBg.fileCount} clip{videoBg.fileCount !== 1 ? "s" : ""}
                        {" · "}random pick per output
                        {" · "}looped to fill duration
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Color overlay */}
              <Field label="Color overlay">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="color"
                    value={overlayHex}
                    onChange={(e) => onVideoBg({ overlayColor: e.target.value })}
                    disabled={disabled}
                    className={cn(
                      "h-8 w-12 shrink-0 cursor-pointer rounded border border-border bg-background p-0.5",
                      disabled && "opacity-50 pointer-events-none",
                    )}
                    title="Pick overlay colour"
                  />
                  <Input
                    type="text"
                    value={hexDraft}
                    onChange={(e) => setHexDraft(e.target.value)}
                    onBlur={commitHexOverlay}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitHexOverlay();
                    }}
                    spellCheck={false}
                    placeholder="#000000"
                    className={cn(inputCls, "w-28 font-mono")}
                    disabled={disabled}
                    aria-label="Overlay colour hex"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Wash over the video between the clip and your photo — use 6-digit hex (#RRGGBB). Set opacity below to activate.
                </p>
              </Field>

              <Field label={`Overlay opacity — ${videoBg.overlayOpacity ?? 0}%`} htmlFor="s-vbg-opacity">
                <Slider
                  id="s-vbg-opacity"
                  min={0}
                  max={100}
                  step={5}
                  value={[videoBg.overlayOpacity ?? 0]}
                  onValueChange={([v]) => onVideoBg({ overlayOpacity: v })}
                  disabled={disabled}
                  className={sliderCls}
                />
                <p className="text-[11px] text-muted-foreground">
                  {(videoBg.overlayOpacity ?? 0) === 0
                    ? "0% — overlay disabled"
                    : `${videoBg.overlayOpacity ?? 0}% opacity over the video background`}
                </p>
              </Field>

              <Field
                label={`Photo on video — max ${videoBg.overlayImageMaxPercent ?? 100}% of frame`}
                htmlFor="s-vbg-photo-pct"
              >
                <Slider
                  id="s-vbg-photo-pct"
                  min={50}
                  max={100}
                  step={1}
                  value={[videoBg.overlayImageMaxPercent ?? 100]}
                  onValueChange={([v]) => onVideoBg({ overlayImageMaxPercent: v })}
                  disabled={disabled}
                  className={sliderCls}
                />
                <p className="text-[11px] text-muted-foreground">
                  Lower = smaller photo, more visible B-roll around the edges. 100% = photo may cover the whole frame if it matches the reel aspect ratio.
                </p>
              </Field>
            </>
          )}

          </div>

      </CollapseGroup>

      <CollapseGroup
        groupId="settings-watermark"
        title="Watermark"
        open={openGroups["settings-watermark"]}
        onToggle={() => toggleGroup("settings-watermark")}
      >

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

      </CollapseGroup>

      <CollapseGroup
        groupId="settings-metadata"
        title="Metadata"
        open={openGroups["settings-metadata"]}
        onToggle={() => toggleGroup("settings-metadata")}
      >

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

      </CollapseGroup>

      <div className="border-t border-border pt-3">
        <button
          type="button"
          onClick={onResetDefaults}
          disabled={disabled}
          className={cn(
            "inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium",
            "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
            disabled && "opacity-50 pointer-events-none",
          )}
        >
          Reset to default
        </button>
      </div>

    </div>
  );
}
