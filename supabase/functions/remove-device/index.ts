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

    const { deviceId } = await req.json() as { deviceId?: string };
    if (!deviceId) return json({ error: "deviceId required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // The WHERE on user_id ensures a user can only remove their own devices.
    const { error } = await supabase
      .from("user_devices")
      .delete()
      .eq("user_id", userId)
      .eq("device_id", deviceId);

    if (error) throw error;

    return json({ ok: true });
  } catch (err) {
    console.error("remove-device error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
