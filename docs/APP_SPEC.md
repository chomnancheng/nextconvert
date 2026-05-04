# App: Image to Reels Converter (Desktop)

## Overview
A desktop app built with Electron that converts images or folders into short videos (Reels format).

## Tech Stack
- Runtime: Bun
- Desktop: Electron
- UI: React + Vite + shadcn/ui + Tailwind
- Media Engine: FFmpeg
- Auth: Better Auth (token-based, local persistence)

## Core Rules
- All processing is local (no cloud upload)
- User must login before accessing app
- Token persists until logout
- Clean, minimal UI (like CapCut)

---

## Main Feature: Image to Reels

### 1. Input
- Drag & drop:
  - Single image
  - Multiple images
  - Folder
- Supported formats: jpg, png, webp

---

### 2. Output
- Default output folder:
  - Same location as input
  - Create `/converted` folder automatically
- Allow user to change output folder

---

### 3. Settings

#### Size Presets
- Facebook Reel (default) → 1080x1920
- Facebook Story → 1080x1920
- Facebook Square → 1080x1080

#### Quality
- Default: 80
- Map to FFmpeg CRF scale

#### Watermark
- Image or text
- Positions:
  - top-left, top-right, bottom-left, bottom-right
- Adjustable opacity

#### Metadata
- Title
- Author
- Description

---

### 4. Processing
- Use FFmpeg
- Support:
  - Single image → 5s video
  - Multiple images → slideshow
- Batch processing supported

---

### 5. UX
- Show preview thumbnails
- Progress bar
- Logs panel
- Success / error notification

---

## Authentication
- Use Better Auth
- Flow:
  - If no token → show login
  - If token exists → go to app
- Store token locally (electron-store or file)
- Clear token on logout

---

## Folder Structure
/app
  /electron
  /renderer
  /lib
  /components
  /pages

---

## Coding Rules
- Use TypeScript
- Keep components modular
- Separate UI and logic
- No inline FFmpeg commands in UI layer

---

## Goal (MVP)
- Drag & drop works
- Convert images to video
- Output saved correctly
- Login required

---

## 🎬 Extended Settings (NEW)

### 1. Duration
- Default video length: 59 seconds
- User can adjust (range: 5–120 seconds)

Behavior:
- Single image → stretch to full duration
- Multiple images → auto distribute duration evenly

---

### 2. Music (NEW FEATURE)

User can:
- Select a folder containing mp3 files
- System randomly picks 1 mp3 per video

Options:
- Toggle: Enable / Disable music
- Volume control (0–100)

Behavior:
- If multiple videos → random track per video
- Trim or loop audio to match video duration

---

### 3. Custom Settings Panel

UI must include:

- Duration input (seconds)
- Music folder selector
- Toggle music ON/OFF
- Volume slider
- Watermark settings
- Metadata fields

---

### 4. FFmpeg Audio Logic

- Randomly pick mp3 from folder
- Trim audio to match video length:
  - Use `-shortest` OR trim filter
- Loop if shorter:
  - `-stream_loop -1`

---

### 5. UX Requirements

- Show selected music folder path
- Show number of mp3 files detected
- Warn if folder is empty