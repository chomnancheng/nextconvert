import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/renderer/components/ui/tabs";
import AuthBar from "@/renderer/components/AuthBar";
import DeviceGate from "@/renderer/components/DeviceGate";
import { Show, SignIn } from "@clerk/react";
import { DownloadCloud, Film, Loader2, Maximize2, Minimize2, Minus, Moon, Sun, X } from "lucide-react";
import ImageToReels from "@/renderer/pages/ImageToReels";
import { type CSSProperties, useEffect, useState } from "react";

const clerkEnabled = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim());
const authRequired = import.meta.env.PROD;

function MissingAuthConfig() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 overflow-auto px-6 py-10 text-center">
      <Film className="h-14 w-14 text-destructive" aria-hidden />
      <div className="max-w-md space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">Authentication is not configured</h1>
        <p className="text-sm text-muted-foreground">
          This packaged build is missing the Clerk publishable key, so sign-in cannot start. Rebuild the installer with
          VITE_CLERK_PUBLISHABLE_KEY set.
        </p>
      </div>
    </main>
  );
}

export default function Layout() {
  const [isChecking, setIsChecking] = useState(true);
  const [updateMessage, setUpdateMessage] = useState<string>("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [hasUpdate, setHasUpdate] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string>("");
  const [isMaximized, setIsMaximized] = useState(false);

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

  useEffect(() => {
    window.electronAPI.isWindowMaximized().then(setIsMaximized).catch(() => {
      setIsMaximized(false);
    });
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

  const handleToggleMaximize = async () => {
    const next = await window.electronAPI.toggleMaximizeWindow();
    setIsMaximized(next);
  };

  const mainInner = (isAdmin = false) => (
    <Tabs defaultValue="reel-stories" className="flex flex-1 flex-col overflow-hidden">
      <TabsList className="w-fit">
        <TabsTrigger value="reel-stories">Reel Stories</TabsTrigger>
      </TabsList>

      <TabsContent value="reel-stories" className="flex flex-1 overflow-hidden mt-4">
        <ImageToReels isAdmin={isAdmin} />
      </TabsContent>
    </Tabs>
  );

  return (
    <div className="flex h-screen flex-col bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header
        className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-4"
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      >
        <div className="flex min-w-0 items-center gap-3">
          <Film className="h-5 w-5 text-primary" />
          <span className="text-base font-semibold tracking-tight">NextConvert</span>
        </div>
        <div className="flex min-w-0 shrink-0 items-center gap-3" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
          <AuthBar />
          {currentVersion && (
            <span className="hidden text-xs text-muted-foreground lg:inline">Current version: {currentVersion}</span>
          )}
          {updateMessage && (
            <span className="hidden max-w-[220px] truncate text-xs text-muted-foreground xl:inline">{updateMessage}</span>
          )}
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
          <div className="flex shrink-0 items-center overflow-hidden rounded-md border border-border bg-card">
            <button
              type="button"
              title="Minimize"
              className="inline-flex h-8 w-9 items-center justify-center hover:bg-accent"
              onClick={() => {
                void window.electronAPI.minimizeWindow();
              }}
            >
              <Minus className="h-4 w-4" aria-hidden />
              <span className="sr-only">Minimize</span>
            </button>
            <button
              type="button"
              title={isMaximized ? "Restore" : "Maximize"}
              className="inline-flex h-8 w-9 items-center justify-center hover:bg-accent"
              onClick={() => {
                void handleToggleMaximize();
              }}
            >
              {isMaximized ? <Minimize2 className="h-4 w-4" aria-hidden /> : <Maximize2 className="h-4 w-4" aria-hidden />}
              <span className="sr-only">{isMaximized ? "Restore window" : "Maximize window"}</span>
            </button>
            <button
              type="button"
              title="Close"
              className="inline-flex h-8 w-9 items-center justify-center hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => {
                void window.electronAPI.closeWindow();
              }}
            >
              <X className="h-4 w-4" aria-hidden />
              <span className="sr-only">Close</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main: packaged builds require Clerk; local dev can still run without auth env. */}
      {authRequired && !clerkEnabled ? (
        <MissingAuthConfig />
      ) : clerkEnabled ? (
        <>
          <Show when="signed-out">
            <main className="flex flex-1 flex-col items-center justify-center gap-6 overflow-auto px-6 py-10 text-center">
              <Film className="h-14 w-14 text-primary" aria-hidden />
              <div className="max-w-md space-y-2">
                <h1 className="text-xl font-semibold tracking-tight">Sign in to use NextConvert</h1>
                <p className="text-sm text-muted-foreground">
                  Reel Stories and conversion run only after you sign in with your account.
                </p>
              </div>
              <SignIn fallbackRedirectUrl="/" routing="hash" />
            </main>
          </Show>
          <Show when="signed-in">
            <DeviceGate>
              {(isAdmin) => (
                <main className="flex flex-1 flex-col overflow-hidden px-6 pt-5 pb-6">{mainInner(isAdmin)}</main>
              )}
            </DeviceGate>
          </Show>
        </>
      ) : (
        <main className="flex flex-1 flex-col overflow-hidden px-6 pt-5 pb-6">{mainInner()}</main>
      )}
    </div>
  );
}
