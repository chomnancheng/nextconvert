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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: devices, error } = await supabase
      .from("user_devices")
      .select("id, device_id, device_name, registered_at, last_seen")
      .eq("user_id", userId)
      .order("last_seen", { ascending: false });

    if (error) throw error;

    return json({ devices: devices ?? [] });
  } catch (err) {
    console.error("list-devices error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
