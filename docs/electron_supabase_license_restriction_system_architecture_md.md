# Electron App License Restriction System

## Project Goal
Build a secure activation and device restriction system for an Electron application using:

- Electron App
- Next.js API Server
- Supabase Auth
- PostgreSQL Database
- Device Limitation System
- Manager-Based Activation
- No Admin Dashboard Required
- Manual Activation via PostgreSQL / Supabase Studio

---

# System Overview

The application should:

1. Allow users to login securely
2. Restrict how many computers can use the account
3. Allow manager to manually activate licenses
4. Prevent account sharing
5. Track active devices
6. Block unauthorized devices
7. Support subscription or package limits later
8. Work with Electron desktop app
9. Use Supabase Auth for authentication
10. Use PostgreSQL as central database

---

# Recommended Stack

## Frontend App

- Electron
- React or Next.js frontend inside Electron
- Bun runtime
- TailwindCSS

## Backend API

- Next.js API Routes
- Hosted separately
- Vercel compatible

## Database

- Supabase PostgreSQL

## Authentication

- Supabase Auth

## ORM

- Prisma ORM

## Security

- JWT Validation
- Device Fingerprint
- Session Tracking
- Encrypted Local Storage

---

# Architecture Flow

## User Login Flow

```text
Electron App
   ↓
Supabase Auth Login
   ↓
Receive Access Token
   ↓
Call Next.js API
   ↓
Validate Device
   ↓
Check License Status
   ↓
Allow or Block Access
```

---

# Core Features

# 1. Authentication System

Use Supabase Auth:

- Email login
- Password login
- Magic link optional
- Google login optional

Recommended:

```text
Email + Password
```

because easier to control device restriction.

---

# 2. Device Restriction System

Every computer generates unique fingerprint.

Example:

```text
DEVICE_ID = SHA256(
  mac_address +
  cpu_serial +
  motherboard_serial +
  os_version
)
```

Store inside local encrypted storage.

---

# 3. Device Limit

Each account has:

```text
max_devices
```

Examples:

| Plan | Devices |
|---|---|
| Basic | 1 |
| Pro | 2 |
| Agency | 5 |

---

# 4. Manager Activation

No admin panel required.

Manager activates user directly in:

- Supabase Studio
- PostgreSQL Table Editor

Manager changes:

```text
is_active = true
```

or

```text
subscription_status = active
```

---

# Database Design

# users

Managed by Supabase Auth.

---

# user_profiles

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name TEXT,
  role TEXT DEFAULT 'user',
  is_active BOOLEAN DEFAULT false,
  max_devices INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

# user_devices

```sql
CREATE TABLE user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  device_id TEXT NOT NULL,
  device_name TEXT,
  os_name TEXT,
  last_active TIMESTAMP DEFAULT NOW(),
  is_blocked BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

# user_sessions

```sql
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  device_id TEXT,
  ip_address TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);
```

---

# videos_generated

```sql
CREATE TABLE videos_generated (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  title TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

# Device Validation Logic

## Login Validation

When user logs in:

### Step 1

Authenticate with Supabase.

### Step 2

Electron app sends:

```json
{
  "device_id": "DEVICE_HASH",
  "device_name": "MacBook Pro",
  "os_name": "macOS"
}
```

### Step 3

API checks:

- User active?
- Device already exists?
- Reached max device?
- Device blocked?

### Step 4

Allow or deny access.

---

# Restriction Logic Example

```ts
if (!profile.is_active) {
  return "ACCOUNT_DISABLED"
}

if (deviceBlocked) {
  return "DEVICE_BLOCKED"
}

if (!existingDevice && totalDevices >= maxDevices) {
  return "DEVICE_LIMIT_REACHED"
}
```

---

# Electron Security

# Recommended

## Disable Node Integration

```ts
nodeIntegration: false
```

## Enable Context Isolation

```ts
contextIsolation: true
```

## Use Preload Script

```ts
preload: preload.js
```

## Disable Remote Module

```ts
enableRemoteModule: false
```

---

# Secure Token Storage

Do NOT store token in:

- localStorage
- plain json file

Recommended:

```text
keytar
```

Store:

- access token
- refresh token
- device id

inside OS secure vault.

---

# Anti Sharing Protection

# Recommended Features

## Auto Logout Previous Session

Optional:

When new device login:

```text
logout previous device
```

---

## IP Monitoring

Track:

- Country
- IP changes
- Suspicious activity

---

## Device Revocation

Manager can delete device:

```sql
DELETE FROM user_devices
WHERE id = 'DEVICE_ID';
```

---

# Suggested API Structure

```text
/apps
  /electron-app
  /nextconvert-server
```

---

# Next.js API Structure

```text
/app/api
  /auth/login
  /auth/validate
  /devices/register
  /devices/list
  /videos/create
```

---

# Example Validate Endpoint

```ts
POST /api/auth/validate
```

Request:

```json
{
  "device_id": "abc123",
  "token": "SUPABASE_TOKEN"
}
```

Response:

```json
{
  "success": true,
  "max_devices": 2,
  "current_devices": 1
}
```

---

# Recommended Electron Libraries

| Purpose | Library |
|---|---|
| Secure storage | keytar |
| Device info | node-machine-id |
| Encryption | crypto-js |
| HTTP requests | axios |
| ORM | Prisma |
| Auth | Supabase |

---

# Device Fingerprint Example

```ts
import { machineIdSync } from 'node-machine-id'

const deviceId = machineIdSync()
```

Recommended:

Hash before send.

```ts
SHA256(deviceId)
```

---

# Supabase Row Level Security

Enable RLS.

Important tables:

- user_profiles
- user_devices
- user_sessions
- videos_generated

---

# Example RLS Policy

```sql
CREATE POLICY "Users can see own devices"
ON user_devices
FOR SELECT
USING (auth.uid() = user_id);
```

---

# Video Generation Restriction

Add generation limit.

Example columns:

```sql
monthly_video_limit INTEGER DEFAULT 30
monthly_video_used INTEGER DEFAULT 0
```

Before generating:

```ts
if (used >= limit) {
  return "VIDEO_LIMIT_REACHED"
}
```

---

# Recommended Production Flow

## Step 1

User registers.

## Step 2

Manager manually activates user in Supabase Studio.

## Step 3

User logs into Electron app.

## Step 4

App validates device.

## Step 5

User allowed to generate videos.

---

# Deployment Recommendation

# Electron App

- Electron Builder
- Auto Update optional

---

# Next.js API

Deploy on:

- Vercel
- Railway
- Render

Recommended:

```text
Vercel
```

---

# Database

Use:

```text
Supabase PostgreSQL
```

---

# Recommended Future Features

## Subscription Billing

- Stripe
- Paddle

---

## Team Workspace

Allow multiple users under organization.

---

## Real-time Monitoring

Track:

- Active sessions
- Device usage
- Video generation logs

---

## Remote Logout

Force logout all devices.

---

# Final Recommended Structure

```text
Electron App
   ↓
Supabase Auth
   ↓
Next.js API Server
   ↓
Supabase PostgreSQL
```

---

# Recommended Security Priority

| Priority | Feature |
|---|---|
| High | Device restriction |
| High | Secure token storage |
| High | JWT validation |
| High | RLS policies |
| Medium | IP tracking |
| Medium | Auto logout |
| Medium | Suspicious login detection |

---

# Recommended MVP

For fastest launch:

## Build First

- Supabase Auth
- Device restriction
- Manual activation
- Video limit
- Electron login
- Next.js validation API

## Build Later

- Billing
- Team accounts
- Admin dashboard
- Analytics
- Auto subscription

---

# Conclusion

This architecture provides:

- Better security
- Computer/device limitation
- Manual manager approval
- Simple maintenance
- Scalable backend
- Electron app protection
- Future subscription support
- Production-ready structure

Most importantly:

```text
No admin dashboard needed initially.
```

Everything can be managed directly inside:

```text
Supabase Studio / PostgreSQL
```

