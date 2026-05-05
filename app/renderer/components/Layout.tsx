import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/renderer/components/ui/tabs";
import { Film } from "lucide-react";
import ImageToReels from "@/renderer/pages/ImageToReels";
import { useState } from "react";

export default function Layout() {
  const [isChecking, setIsChecking] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string>("");

  const handleUpdateClick = async () => {
    if (isChecking) return;
    setIsChecking(true);
    setUpdateMessage("Checking...");
    const check = await window.electronAPI.checkForUpdates();
    if (!check.ok) {
      setUpdateMessage(`Check failed: ${check.error ?? "Unknown error"}`);
      setIsChecking(false);
      return;
    }
    if (!check.hasUpdate) {
      setUpdateMessage(`Up to date (${check.currentVersion})`);
      setIsChecking(false);
      return;
    }

    setUpdateMessage(`Downloading v${check.latestVersion}...`);
    const download = await window.electronAPI.downloadLatestUpdate();
    if (!download.ok) {
      setUpdateMessage(`Download failed: ${download.error ?? "Unknown error"}`);
      setIsChecking(false);
      return;
    }
    setUpdateMessage(`Downloaded v${download.latestVersion}. Installer opened.`);
    setIsChecking(false);
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-2">
          <Film className="h-5 w-5 text-primary" />
          <span className="text-base font-semibold tracking-tight">NextConvert</span>
        </div>
        <div className="flex items-center gap-3">
          {updateMessage && (
            <span className="max-w-[420px] truncate text-xs text-muted-foreground">{updateMessage}</span>
          )}
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-60"
            onClick={handleUpdateClick}
            disabled={isChecking}
          >
            {isChecking ? "Updating..." : "Update"}
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden px-6 pt-5 pb-6">
        <Tabs defaultValue="image-to-reels" className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="w-fit">
            <TabsTrigger value="image-to-reels">Image to Reels</TabsTrigger>
          </TabsList>

          <TabsContent
            value="image-to-reels"
            className="flex flex-1 overflow-hidden mt-4"
          >
            <ImageToReels />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
