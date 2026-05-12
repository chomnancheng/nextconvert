import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyClerkToken, corsHeaders, json } from "../_shared/clerk-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    let userId: string;
    try {
      userId = await verifyClerkToken(authHeader.slice(7));
    } catch {
      return json({ error: "Invalid token" }, 401);
    }

    const body = await req.json() as { deviceId?: string; deviceName?: string };
    const { deviceId, deviceName = "Unknown" } = body;
    if (!deviceId) return json({ error: "deviceId required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Check user is active and get device limit.
    // Unknown Clerk users are recorded as pending approval by default.
    const { data: access, error: accessError } = await supabase
      .from("user_access")
      .select("is_active, device_limit, is_admin")
      .eq("user_id", userId)
      .maybeSingle();

    if (accessError) {
      console.error("user_access lookup failed:", accessError);
      return json({ error: "Access lookup failed" }, 500);
    }

    if (!access) {
      const { error: insertError } = await supabase
        .from("user_access")
        .insert({ user_id: userId, is_active: false, device_limit: 1 });
      if (insertError && insertError.code !== "23505") {
        console.error("pending user_access insert failed:", insertError);
        return json({ error: "Access registration failed" }, 500);
      }
      return json({ allowed: false, reason: "not_activated" });
    }

    if (!access.is_active) return json({ allowed: false, reason: "not_activated" });

    // If device already registered, update last_seen and allow
    const { data: existing } = await supabase
      .from("user_devices")
      .select("id")
      .eq("user_id", userId)
      .eq("device_id", deviceId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("user_devices")
        .update({ last_seen: new Date().toISOString() })
        .eq("id", existing.id);
      return json({ allowed: true, is_admin: access.is_admin ?? false });
    }

    // Count registered devices
    const { count } = await supabase
      .from("user_devices")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if ((count ?? 0) >= access.device_limit) {
      return json({ allowed: false, reason: "device_limit_reached" });
    }

    // Register new device
    await supabase.from("user_devices").insert({
      user_id: userId,
      device_id: deviceId,
      device_name: deviceName,
    });

    return json({ allowed: true, is_admin: access.is_admin ?? false });
  } catch (err) {
    console.error("check-device error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
