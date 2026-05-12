# Electron License & Device Restriction Skill
## Stack: Bun + Electron + Clerk + Supabase Edge Functions

---

# Goal

Build secure authentication and device restriction for Electron desktop app.

Features:
- Clerk authentication
- Device/PC limit
- Account activation
- Device registration
- Manual management via Supabase Studio
- Bun runtime support
- No full backend required

---

# Recommended Architecture

```txt
Electron App
   ↓
Clerk Authentication
   ↓
Supabase Edge Function
   ↓
Supabase Postgres

---

# Clerk + React (Vite) in this repo (Bun)

Official quickstart: [Clerk React — Getting started](https://clerk.com/docs/react/getting-started/quickstart).

1. **Install** (Bun, not npm):

   ```bash
   bun add @clerk/react@latest
   ```

2. **Environment** — add to `.env` or `.env.local` in the project root (same folder as `package.json`). Vite only exposes variables prefixed with `VITE_`:

   ```bash
   VITE_CLERK_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
   ```

   Copy from [Clerk Dashboard → API keys](https://dashboard.clerk.com/~/api-keys) (React). See root `.env.example`.

3. **Provider** — `ClerkProvider` wraps the app in `app/renderer/main.tsx` when `VITE_CLERK_PUBLISHABLE_KEY` is set. `@clerk/react` v6 TypeScript types require passing `publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}` (still sourced from env, not hardcoded).

4. **UI** — header auth: `app/renderer/components/AuthBar.tsx` uses `<Show when="signed-out">`, `<SignInButton>`, `<SignUpButton>`, `<Show when="signed-in">`, `<UserButton>`.

5. **Electron dev** — the renderer loads `http://127.0.0.1:5173`. Add that origin in the Clerk dashboard if sign-in redirects or OAuth are blocked.