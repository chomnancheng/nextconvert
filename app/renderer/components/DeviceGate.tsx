import { useEffect } from "react";
import { SignOutButton } from "@clerk/react";
import { Film, Loader2, Monitor, MonitorX, ShieldAlert, Trash2 } from "lucide-react";
import { useDeviceCheck } from "@/renderer/hooks/useDeviceCheck";
import { useDevices } from "@/renderer/hooks/useDevices";

const btnBase =
  "inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent";

function DeviceLimitScreen({ retry }: { retry: () => void }) {
  const { devices, loading, fetchDevices, removeDevice } = useDevices();

  useEffect(() => { void fetchDevices(); }, [fetchDevices]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 overflow-auto px-6 py-10 text-center">
      <MonitorX className="h-14 w-14 text-destructive" aria-hidden />
      <div className="max-w-md space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">Device limit reached</h1>
        <p className="text-sm text-muted-foreground">
          Remove an old device below to register this one.
        </p>
      </div>

      <div className="w-full max-w-sm rounded-lg border border-border bg-card">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading devices…
          </div>
        ) : devices.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">No devices found.</p>
        ) : (
          <ul className="divide-y divide-border">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-left">
                <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.device_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Last seen {new Date(d.last_seen).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  title="Remove device"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void removeDevice(d.device_id)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">Remove {d.device_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" className={btnBase} onClick={retry}>
          Try again
        </button>
        <SignOutButton>
          <button type="button" className={btnBase}>Sign out</button>
        </SignOutButton>
      </div>
    </main>
  );
}

export default function DeviceGate({ children }: { children: (isAdmin: boolean) => React.ReactNode }) {
  const { status, isAdmin, retry } = useDeviceCheck();

  if (status === "allowed") return <>{children(isAdmin)}</>;

  if (status === "idle" || status === "checking") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">Verifying access…</p>
      </main>
    );
  }

  if (status === "not_activated") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center">
        <ShieldAlert className="h-14 w-14 text-destructive" aria-hidden />
        <div className="max-w-md space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">Account not activated</h1>
          <p className="text-sm text-muted-foreground">
            Your account has not been activated yet. Please contact support to get access.
          </p>
        </div>
        <SignOutButton>
          <button type="button" className={btnBase}>Sign out</button>
        </SignOutButton>
      </main>
    );
  }

  if (status === "device_limit_reached") {
    return <DeviceLimitScreen retry={retry} />;
  }

  if (status === "not_configured") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center">
        <ShieldAlert className="h-14 w-14 text-destructive" aria-hidden />
        <div className="max-w-md space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">Approval check not configured</h1>
          <p className="text-sm text-muted-foreground">
            Supabase access verification is required before signed-in users can open the app.
          </p>
        </div>
        <SignOutButton>
          <button type="button" className={btnBase}>Sign out</button>
        </SignOutButton>
      </main>
    );
  }

  // error
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <Film className="h-14 w-14 text-muted-foreground" aria-hidden />
      <div className="max-w-md space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">Could not verify access</h1>
        <p className="text-sm text-muted-foreground">
          Failed to reach the access verification service. Check your internet connection and try again.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" className={btnBase} onClick={retry}>
          Try again
        </button>
        <SignOutButton>
          <button type="button" className={btnBase}>Sign out</button>
        </SignOutButton>
      </div>
    </main>
  );
}
