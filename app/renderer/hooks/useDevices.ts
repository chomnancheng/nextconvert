import { useState, useCallback } from "react";
import { useAuth } from "@clerk/react";

export interface DeviceRecord {
  id: string;
  device_id: string;
  device_name: string;
  registered_at: string;
  last_seen: string;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

async function edgeFetch(path: string, token: string, init?: RequestInit) {
  return fetch(`${supabaseUrl}/functions/v1/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey!,
      ...(init?.headers ?? {}),
    },
  });
}

export function useDevices() {
  const { getToken } = useAuth();
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    if (!supabaseUrl || !supabaseAnonKey) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) { setError("Not authenticated"); return; }
      const res = await edgeFetch("list-devices", token);
      if (!res.ok) { setError("Failed to load devices"); return; }
      const data = (await res.json()) as { devices: DeviceRecord[] };
      setDevices(data.devices ?? []);
    } catch {
      setError("Failed to load devices");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const removeDevice = useCallback(async (deviceId: string) => {
    if (!supabaseUrl || !supabaseAnonKey) return;
    const token = await getToken();
    if (!token) return;
    // Optimistic update
    setDevices((prev) => prev.filter((d) => d.device_id !== deviceId));
    try {
      await edgeFetch("remove-device", token, {
        method: "POST",
        body: JSON.stringify({ deviceId }),
      });
    } catch {
      // Refresh to get the real state on failure
      void fetchDevices();
    }
  }, [getToken, fetchDevices]);

  return { devices, loading, error, fetchDevices, removeDevice };
}
