import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/renderer/components/ui/tabs";
import { DownloadCloud, Film, Loader2, Moon, Sun } from "lucide-react";
import ImageToReels from "@/renderer/pages/ImageToReels";
import { useEffect, useState } from "react";

export default function Layout() {
  const [isChecking, setIsChecking] = useState(true);
  const [updateMessage, setUpdateMessage] = useState<string>("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [hasUpdate, setHasUpdate] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string>("");

  useEffect(() => {
    const saved = localStorage.getItem("themeMode");
    const mode = saved === "dark" ? "dark" : "light";
    setTheme(mode);
    document.documentElement.classList.toggle("dark", mode === "dark");
  }, []);

  useEffect(() => {
    const check = async () => {
      setIsChecking(true);
      const result = await window.electronAPI.checkForUpdates();
      if (!result.ok) {
        setHasUpdate(false);
        setUpdateMessage("Update unavailable");
        setCurrentVersion(result.currentVersion ?? "");
        setIsChecking(false);
        return;
      }
      setCurrentVersion(result.currentVersion);
      if (result.hasUpdate) {
        setHasUpdate(true);
        setUpdateMessage(`v${result.latestVersion} available`);
      } else {
        setHasUpdate(false);
        setUpdateMessage("");
      }
      setIsChecking(false);
    };
    void check();
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("themeMode", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  const handleUpdateClick = async () => {
    if (isChecking || !hasUpdate) return;
    setIsChecking(true);
    setUpdateMessage("Downloading update...");
    const download = await window.electronAPI.downloadLatestUpdate();
    if (!download.ok) {
      setUpdateMessage(`Download failed: ${download.error ?? "Unknown error"}`);
      setIsChecking(false);
      return;
    }
    setUpdateMessage(`Downloaded v${download.latestVersion}. Installer opened.`);
    setHasUpdate(false);
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
          {currentVersion && (
            <span className="text-xs text-muted-foreground">Current version: {currentVersion}</span>
          )}
          {updateMessage && (
            <span className="max-w-[420px] truncate text-xs text-muted-foreground">{updateMessage}</span>
          )}
          <button
            type="button"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border hover:bg-accent"
            onClick={toggleTheme}
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4 text-foreground" aria-hidden />
            ) : (
              <Moon className="h-4 w-4 text-foreground" aria-hidden />
            )}
            <span className="sr-only">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
          {hasUpdate && (
            <button
              type="button"
              title="Download update"
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-60"
              onClick={handleUpdateClick}
              disabled={isChecking}
            >
              {isChecking ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              ) : (
                <DownloadCloud className="h-4 w-4 shrink-0" aria-hidden />
              )}
              {isChecking ? "Checking…" : "Update"}
            </button>
          )}
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
