import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/react";

export type DeviceCheckStatus =
  | "idle"
  | "checking"
  | "allowed"
  | "not_activated"
  | "device_limit_reached"
  | "not_configured"
  | "error";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const deviceCheckEnabled = Boolean(supabaseUrl && supabaseAnonKey);

export function useDeviceCheck() {
  const { getToken } = useAuth();
  const { isSignedIn, isLoaded } = useUser();
  const [status, setStatus] = useState<DeviceCheckStatus>("idle");
  const [isAdmin, setIsAdmin] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setStatus("idle");
      return;
    }

    if (!deviceCheckEnabled) {
      setStatus("not_configured");
      return;
    }

    let cancelled = false;

    const run = async () => {
      setStatus("checking");
      try {
        const token = await getToken();
        if (!token) { if (!cancelled) setStatus("error"); return; }

        const [deviceId, deviceName] = await Promise.all([
          window.electronAPI.getDeviceId(),
          window.electronAPI.getDeviceName(),
        ]);

        const res = await fetch(`${supabaseUrl}/functions/v1/check-device`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: supabaseAnonKey!,
          },
          body: JSON.stringify({ deviceId, deviceName }),
        });

        if (cancelled) return;

        if (!res.ok) { setStatus("error"); return; }

        const data = (await res.json()) as { allowed: boolean; reason?: string; is_admin?: boolean };

        if (data.allowed) {
          setIsAdmin(data.is_admin ?? false);
          setStatus("allowed");
        } else if (data.reason === "not_activated") {
          setStatus("not_activated");
        } else if (data.reason === "device_limit_reached") {
          setStatus("device_limit_reached");
        } else {
          setStatus("error");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, getToken, retryCount]);

  return { status, isAdmin, retry: () => setRetryCount((c) => c + 1) };
}
