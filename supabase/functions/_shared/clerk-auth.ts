import * as jose from "npm:jose@5";

/** Verify a Clerk JWT using the JWKS endpoint stored in CLERK_JWKS_URL.
 *  Returns the Clerk user ID (sub claim) on success, throws on failure. */
export async function verifyClerkToken(token: string): Promise<string> {
  const jwksUrl = Deno.env.get("CLERK_JWKS_URL");
  if (!jwksUrl) throw new Error("CLERK_JWKS_URL not configured");
  const jwks = jose.createRemoteJWKSet(new URL(jwksUrl));
  const { payload } = await jose.jwtVerify(token, jwks);
  return payload.sub as string;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
