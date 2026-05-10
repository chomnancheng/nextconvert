# SKILL: Electron + Bun + Better Auth + Supabase License Gate

## Purpose
Integrate Better Auth (email/password + Google OAuth) and a Supabase machine-license gate
into an **existing** Electron app that uses **Bun** as the runtime/package manager.
The login screen does not yet exist and must be created as part of this integration.
A manager activates licenses and controls machine limits directly in **Supabase Studio**
(no custom admin UI needed).

---

## Stack Assumptions
| Layer | Tool |
|---|---|
| Runtime / package manager | Bun |
| Desktop shell | Electron |
| Auth library | Better Auth |
| Database | Supabase (Postgres + RLS) |
| Frontend | React **or** Vue **or** Svelte **or** plain HTML — adapt per project |
| Language | TypeScript (preferred) or JavaScript |

---

## Step 0 — Read the existing project first

Before writing any code:
1. `view` the project root to understand the folder layout.
2. `view` `package.json` (or `bun.lockb` deps) to see what's already installed.
3. Identify the renderer entry point (commonly `src/renderer.tsx`, `src/App.tsx`, `index.html`).
4. Identify the main process file (commonly `src/main.ts`, `electron/main.ts`).
5. Identify the preload script (commonly `src/preload.ts`, `electron/preload.ts`).
6. Note the build tool in use (Vite + electron-vite, Webpack, plain tsc, etc.).

Adapt every path below to match what you find.

---

## Step 1 — Supabase Postgres Schema

Run this once in **Supabase Studio → SQL Editor**.
This is the ONLY place a manager needs to go to activate/revoke licenses.

```sql
-- ─────────────────────────────────────────────
-- 1. LICENSES  (manager edits rows here in Studio)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS licenses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key      TEXT UNIQUE NOT NULL,
  owner_name       TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT FALSE,   -- manager flips TRUE to activate
  max_machines     INT     NOT NULL DEFAULT 1,        -- how many PCs allowed
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- 2. MACHINE REGISTRATIONS  (app writes on first launch)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS machine_registrations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id           UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  machine_fingerprint  TEXT NOT NULL,
  registered_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(license_id, machine_fingerprint)
);

-- ─────────────────────────────────────────────
-- 3. ROW LEVEL SECURITY  (anon key — no admin in app)
-- ─────────────────────────────────────────────
ALTER TABLE licenses              ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_registrations ENABLE ROW LEVEL SECURITY;

-- App can only read active licenses (cannot create/edit/delete)
CREATE POLICY "app_read_active_licenses" ON licenses
  FOR SELECT USING (is_active = TRUE);

-- App can register a new machine
CREATE POLICY "app_insert_machine" ON machine_registrations
  FOR INSERT WITH CHECK (TRUE);

-- App can read machine rows (to count existing registrations)
CREATE POLICY "app_read_machines" ON machine_registrations
  FOR SELECT USING (TRUE);

-- App can update last_seen heartbeat only
CREATE POLICY "app_heartbeat" ON machine_registrations
  FOR UPDATE USING (TRUE) WITH CHECK (TRUE);
```

**Manager workflow** (no code required):
| Task | In Supabase Studio |
|---|---|
| Create license | Table Editor → `licenses` → Insert row |
| Activate | Set `is_active = true` |
| Set machine limit | Set `max_machines = N` |
| Revoke | Set `is_active = false` |
| Remove a machine | Table Editor → `machine_registrations` → delete row |

---

## Step 2 — Install Dependencies (Bun)

```bash
# Core auth + DB
bun add better-auth @supabase/supabase-js

# Machine fingerprinting (works in Node/Electron main process)
bun add node-machine-id

# If using Google OAuth in Better Auth server
bun add @better-auth/oauth2

# Dev: types
bun add -d @types/node
```

> `node-machine-id` must only be imported in the **main process** (Node context).
> Never import it in the renderer.

---

## Step 3 — Environment Variables

Create `.env` at the project root (add to `.gitignore`):

```env
# Supabase — use ANON key only in the Electron app, never service key
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Better Auth
BETTER_AUTH_SECRET=generate-with: openssl rand -hex 32
BETTER_AUTH_URL=http://localhost   # not used in Electron but required by lib

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

If using Vite/electron-vite, prefix renderer env vars with `VITE_`.
Main process env vars can be accessed via `process.env` directly.

---

## Step 4 — Machine Fingerprint Utility (Main Process only)

Create `src/lib/fingerprint.ts`:

```typescript
import { machineIdSync } from 'node-machine-id';
import { createHash } from 'crypto';
import os from 'os';

/**
 * Returns a stable SHA-256 hash of hardware identifiers.
 * Called only from the Electron main process.
 */
export function getMachineFingerprint(): string {
  const raw = [
    machineIdSync(),          // OS-level hardware UUID
    os.hostname(),
    os.cpus()[0]?.model ?? '',
  ].join('|');

  return createHash('sha256').update(raw).digest('hex');
}
```

---

## Step 5 — Supabase Client (shared, used in main process)

Create `src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

// In the main process, use process.env directly.
// In Vite renderer, use import.meta.env.VITE_*
const url  = process.env.VITE_SUPABASE_URL  ?? '';
const key  = process.env.VITE_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(url, key);
```

---

## Step 6 — License Validation Service (Main Process)

Create `src/lib/licenseService.ts`:

```typescript
import { supabase }             from './supabase';
import { getMachineFingerprint } from './fingerprint';

export type LicenseResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export async function validateLicense(licenseKey: string): Promise<LicenseResult> {
  const fingerprint = getMachineFingerprint();

  // 1. Fetch active license
  const { data: license, error } = await supabase
    .from('licenses')
    .select('id, max_machines')
    .eq('license_key', licenseKey)
    .eq('is_active', true)
    .single();

  if (error || !license) {
    return { allowed: false, reason: 'License not found or not yet activated.' };
  }

  // 2. Count registered machines for this license
  const { data: machines } = await supabase
    .from('machine_registrations')
    .select('machine_fingerprint')
    .eq('license_id', license.id);

  const list = (machines ?? []).map(m => m.machine_fingerprint);
  const alreadyRegistered = list.includes(fingerprint);

  if (!alreadyRegistered && list.length >= license.max_machines) {
    return {
      allowed: false,
      reason: `Machine limit reached. This license allows ${license.max_machines} computer(s).`,
    };
  }

  // 3. Register or update heartbeat
  if (alreadyRegistered) {
    await supabase
      .from('machine_registrations')
      .update({ last_seen: new Date().toISOString() })
      .eq('license_id', license.id)
      .eq('machine_fingerprint', fingerprint);
  } else {
    await supabase
      .from('machine_registrations')
      .insert({ license_id: license.id, machine_fingerprint: fingerprint });
  }

  return { allowed: true };
}

/**
 * Call every 30 minutes to keep last_seen fresh.
 * If the license is revoked, this will start returning false — 
 * handle by closing the renderer window.
 */
export async function heartbeat(licenseKey: string): Promise<boolean> {
  const result = await validateLicense(licenseKey);
  return result.allowed;
}
```

---

## Step 7 — Better Auth Server Setup (Main Process or separate Bun server)

### Option A: Embedded in Electron main process (simplest for desktop apps)

Create `src/lib/auth.ts`:

```typescript
import { betterAuth }  from 'better-auth';
import { supabase }    from './supabase'; // for session storage if needed

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET ?? 'change-me',

  emailAndPassword: {
    enabled: true,
    // Supabase handles user storage via its own auth OR use Better Auth's own DB:
    // If using Supabase Auth as the user store, set sendResetPassword etc. here.
  },

  socialProviders: {
    google: {
      clientId:     process.env.GOOGLE_CLIENT_ID     ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
  },

  // Store sessions in Supabase
  database: {
    // Use the @better-auth/supabase adapter if available,
    // or configure a Postgres adapter pointing to your Supabase Postgres URL:
    // postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
  },
});
```

### Option B: Better Auth as a separate Bun HTTP server (recommended for production)

Create `server/index.ts` and run it with `bun server/index.ts`:

```typescript
import { betterAuth } from 'better-auth';
import { Pool }       from 'pg';

const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET!,

  database: new Pool({
    connectionString: process.env.DATABASE_URL, // Supabase Postgres direct URL
  }),

  emailAndPassword: { enabled: true },

  socialProviders: {
    google: {
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
});

// Bun HTTP server
Bun.serve({
  port: 3579,
  async fetch(req) {
    return auth.handler(req);
  },
});

console.log('Better Auth server on http://localhost:3579');
```

Add to `package.json` scripts:
```json
"scripts": {
  "auth-server": "bun server/index.ts",
  "dev": "bun run auth-server & electron-vite dev"
}
```

---

## Step 8 — IPC Bridge (Main Process ↔ Renderer)

### preload.ts — expose safe APIs to renderer

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // License
  validateLicense: (key: string) =>
    ipcRenderer.invoke('license:validate', key),

  // Auth
  signIn:          (email: string, password: string) =>
    ipcRenderer.invoke('auth:sign-in', email, password),

  signInWithGoogle: () =>
    ipcRenderer.invoke('auth:google'),

  signOut: () =>
    ipcRenderer.invoke('auth:sign-out'),

  getSession: () =>
    ipcRenderer.invoke('auth:session'),
});
```

### main.ts — register IPC handlers

```typescript
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { validateLicense, heartbeat }          from './lib/licenseService';
import { createAuthClient }                    from 'better-auth/client'; // or fetch to your server

// ── IPC: License ────────────────────────────────────────────────
ipcMain.handle('license:validate', async (_e, key: string) => {
  return validateLicense(key);
});

// ── IPC: Auth (calls your Better Auth server at localhost:3579) ──
const AUTH_BASE = 'http://localhost:3579';

ipcMain.handle('auth:sign-in', async (_e, email: string, password: string) => {
  const res = await fetch(`${AUTH_BASE}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
});

ipcMain.handle('auth:google', async () => {
  // Open Google OAuth in the system browser, capture redirect
  const res = await fetch(`${AUTH_BASE}/api/auth/sign-in/social`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'google', callbackURL: 'myapp://auth' }),
  });
  const { url } = await res.json();
  shell.openExternal(url); // opens browser for Google login
  // handle deep link callback — see Step 9
});

ipcMain.handle('auth:sign-out', async () => {
  await fetch(`${AUTH_BASE}/api/auth/sign-out`, { method: 'POST' });
  return { ok: true };
});

ipcMain.handle('auth:session', async () => {
  const res = await fetch(`${AUTH_BASE}/api/auth/session`);
  return res.json();
});

// ── Heartbeat every 30 min ───────────────────────────────────────
let currentLicenseKey = '';
setInterval(async () => {
  if (!currentLicenseKey) return;
  const ok = await heartbeat(currentLicenseKey);
  if (!ok) {
    // License revoked — close renderer or show gate again
    mainWindow?.webContents.send('license:revoked');
  }
}, 30 * 60 * 1000);
```

---

## Step 9 — Google OAuth Deep Link (Electron)

Register a custom protocol so Google can redirect back to the app:

```typescript
// main.ts — add before app.whenReady()
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('myapp', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('myapp');
}

// Handle the deep link redirect
app.on('open-url', async (event, urlStr) => {
  event.preventDefault();
  // urlStr = "myapp://auth?code=xxx"
  // Exchange the code via your auth server
  const code = new URL(urlStr).searchParams.get('code');
  if (code) {
    const res = await fetch(`${AUTH_BASE}/api/auth/callback/google?code=${code}`);
    const session = await res.json();
    mainWindow?.webContents.send('auth:session-ready', session);
  }
});
```

Register in `package.json` / electron-builder config:
```json
"protocols": [{ "name": "MyApp", "schemes": ["myapp"] }]
```

---

## Step 10 — Login Screen UI

Create `src/renderer/LoginScreen` adapted to your framework.

### React version (`LoginScreen.tsx`)

```tsx
import { useState } from 'react';

declare global {
  interface Window {
    electronAPI: {
      validateLicense(key: string): Promise<{ allowed: boolean; reason?: string }>;
      signIn(email: string, password: string): Promise<{ user?: object; error?: string }>;
      signInWithGoogle(): Promise<void>;
    };
  }
}

type Step = 'license' | 'auth' | 'app';

export default function LoginScreen({ onAuthed }: { onAuthed: () => void }) {
  const [step, setStep]         = useState<Step>('license');
  const [licenseKey, setKey]    = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  // ── Step 1: License Gate ─────────────────────────────────────
  async function handleLicense() {
    setLoading(true); setError('');
    const result = await window.electronAPI.validateLicense(licenseKey.trim());
    setLoading(false);
    if (result.allowed) {
      setStep('auth');
    } else {
      setError(result.reason ?? 'License denied.');
    }
  }

  // ── Step 2a: Email/Password Sign In ──────────────────────────
  async function handleSignIn() {
    setLoading(true); setError('');
    const result = await window.electronAPI.signIn(email, password);
    setLoading(false);
    if (result.user) {
      onAuthed();
    } else {
      setError(result.error ?? 'Sign in failed.');
    }
  }

  // ── Step 2b: Google Sign In ───────────────────────────────────
  async function handleGoogle() {
    await window.electronAPI.signInWithGoogle();
    // The deep link callback will fire auth:session-ready via IPC
    // Add an ipcRenderer.on listener in useEffect to call onAuthed()
  }

  if (step === 'license') {
    return (
      <div className="login-container">
        <h1>Activate License</h1>
        <p>Enter your license key to continue.</p>
        <input
          type="text"
          placeholder="XXXX-XXXX-XXXX-XXXX"
          value={licenseKey}
          onChange={e => setKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLicense()}
        />
        {error && <p className="error">{error}</p>}
        <button onClick={handleLicense} disabled={loading || !licenseKey}>
          {loading ? 'Checking…' : 'Activate'}
        </button>
      </div>
    );
  }

  return (
    <div className="login-container">
      <h1>Sign In</h1>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSignIn()}
      />
      {error && <p className="error">{error}</p>}
      <button onClick={handleSignIn} disabled={loading}>
        {loading ? 'Signing in…' : 'Sign In'}
      </button>
      <button className="google-btn" onClick={handleGoogle}>
        Sign in with Google
      </button>
    </div>
  );
}
```

### Login Screen CSS (elegant dark theme)

```css
/* login.css — dark industrial theme */
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap');

:root {
  --bg:      #0e0e0e;
  --surface: #171717;
  --border:  #2a2a2a;
  --accent:  #e8ff57;   /* sharp yellow-green */
  --text:    #f0f0f0;
  --muted:   #6b6b6b;
  --error:   #ff5a5a;
}

.login-container {
  width: 100vw; height: 100vh;
  background: var(--bg);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 16px; padding: 40px;
  font-family: 'DM Mono', monospace;
  color: var(--text);
}

h1 {
  font-family: 'Syne', sans-serif;
  font-size: 2.4rem; font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--accent);
  margin-bottom: 4px;
}

p { color: var(--muted); font-size: 0.85rem; margin: 0; }

input {
  width: 320px; padding: 12px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text); font-family: inherit; font-size: 0.95rem;
  outline: none; transition: border-color 0.15s;
}
input:focus { border-color: var(--accent); }

button {
  width: 320px; padding: 13px;
  background: var(--accent); color: #000;
  border: none; border-radius: 6px;
  font-family: 'Syne', sans-serif; font-size: 1rem; font-weight: 700;
  cursor: pointer; letter-spacing: 0.02em;
  transition: opacity 0.15s;
}
button:disabled { opacity: 0.4; cursor: not-allowed; }

.google-btn {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
}
.google-btn:hover { border-color: var(--accent); }

.error { color: var(--error); font-size: 0.82rem; }
```

---

## Step 11 — App Entry: show Login or Main App

### React (`src/renderer/App.tsx`)

```tsx
import { useState, useEffect } from 'react';
import LoginScreen from './LoginScreen';
import MainApp     from './MainApp'; // your existing app

export default function App() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    // Check if session already exists (stay logged in)
    window.electronAPI.getSession?.().then(session => {
      if (session?.user) setAuthed(true);
    });

    // Google OAuth deep link success
    const handler = () => setAuthed(true);
    window.addEventListener('auth:session-ready', handler);
    return () => window.removeEventListener('auth:session-ready', handler);
  }, []);

  return authed
    ? <MainApp />
    : <LoginScreen onAuthed={() => setAuthed(true)} />;
}
```

---

## Step 12 — Bun Scripts in package.json

```json
{
  "scripts": {
    "dev":         "bun run auth-server & electron-vite dev",
    "auth-server": "bun server/index.ts",
    "build":       "electron-vite build",
    "preview":     "electron-vite preview"
  }
}
```

---

## Checklist Before Running

- [ ] Supabase SQL schema executed in Studio
- [ ] `.env` filled with real keys (never commit to git)
- [ ] `BETTER_AUTH_SECRET` generated with `openssl rand -hex 32`
- [ ] Google OAuth credentials configured at console.cloud.google.com
- [ ] Redirect URI set to `myapp://auth` in Google Cloud Console
- [ ] `preload.ts` registered in `new BrowserWindow({ webPreferences: { preload: '...' } })`
- [ ] `contextIsolation: true` and `nodeIntegration: false` in BrowserWindow
- [ ] At least one license row created in Supabase Studio with `is_active = true`

---

## Security Rules

| Rule | Why |
|---|---|
| Only `ANON` key in Electron renderer | RLS blocks all admin actions |
| `SERVICE_ROLE` key only in Supabase Studio / server | Never exposed to client |
| `node-machine-id` in main process only | Renderer has no Node access |
| `contextIsolation: true` | Prevents renderer from accessing Node APIs |
| License key stored in Electron `safeStorage` | Encrypted on disk |

### Persist license key securely

```typescript
import { safeStorage } from 'electron';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { app } from 'electron';

const keyPath = path.join(app.getPath('userData'), 'license.enc');

export function saveLicenseKey(key: string) {
  const encrypted = safeStorage.encryptString(key);
  writeFileSync(keyPath, encrypted);
}

export function loadLicenseKey(): string | null {
  try {
    const buf = readFileSync(keyPath);
    return safeStorage.decryptString(buf);
  } catch {
    return null;
  }
}
```

Call `loadLicenseKey()` on app start — if a key is found, skip the license screen.

---

## Adaptation Notes by Frontend Framework

| Framework | Login component file | Mount in |
|---|---|---|
| React | `src/renderer/LoginScreen.tsx` | `App.tsx` |
| Vue | `src/renderer/LoginScreen.vue` | `App.vue` — use `v-if="authed"` |
| Svelte | `src/renderer/LoginScreen.svelte` | `App.svelte` — use `{#if authed}` |
| Plain HTML | `login.html` | `mainWindow.loadFile('login.html')` → on success `loadFile('index.html')` |

For **plain HTML**, IPC calls go through `window.electronAPI.*` (same preload).
The main process loads `login.html` first and switches to `index.html` after auth.