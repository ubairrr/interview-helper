<div align="center">

# Interview Helper: The Undetectable macOS Co-Pilot

**A minimal-footprint, low-latency AI desktop overlay built to conquer technical and behavioral interviews entirely undetected.**

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/ubairrr/interview-helper/releases)
[![macOS](https://img.shields.io/badge/platform-macOS_only-lightgrey.svg)](https://developer.apple.com/macos/)
[![License: GPLv3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/electron-40.x-47848F.svg)](https://www.electronjs.org/)

</div>

---

> [!CAUTION]
> **For Educational & Demonstration Purposes Only**
>
> This project is a technical proof-of-concept demonstrating low-level macOS API integration, real-time audio WebSocket streaming, and multimodal AI pipelines in an Electron desktop app.
>
> **Using this software during actual interviews or assessments may violate terms of service, professional ethics standards, and in some jurisdictions may be illegal.** It is provided to showcase *how* such a system can be engineered, not as a tool for dishonest use.

---

## Table of Contents

- [What It Does](#what-it-does)
- [Architecture Overview](#architecture-overview)
- [Audio Ingestion Pipeline](#audio-ingestion-pipeline)
- [Vision Analysis Pipeline](#vision-analysis-pipeline)
- [Stealth Mode Implementation](#stealth-mode-implementation)
- [Tech Stack](#tech-stack)
- [IPC Communication Layer](#ipc-communication-layer)
- [React Component Architecture](#react-component-architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Hotkey Reference](#hotkey-reference)
- [AI Provider Compatibility](#ai-provider-compatibility)
- [Release Notes (v1.1.0)](#release-notes-v110)
- [Known Challenges & Solutions](#known-challenges--solutions)
- [Future Roadmap](#future-roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## What It Does

In an era of increasingly intense remote technical evaluations, candidates often struggle with blanking under pressure rather than a lack of foundational knowledge. **Interview Helper** was conceived to solve this critical gap.

It is a macOS desktop application that acts as an invisible floating overlay during remote video interviews. It:

1. **Transcribes both sides of the conversation in real time** — your microphone and the interviewer's system audio are processed in parallel through separate Deepgram WebSocket connections, labeled "You" and "Interviewer" in the transcript log.

2. **Automatically generates AI answers when the interviewer finishes speaking** — a question accumulation state machine buffers speech fragments until Deepgram signals `speech_final`, then fires the full question to any OpenAI-compatible LLM for a concise, spoken-length response.

3. **Analyzes your screen on demand (Vision Assist)** — a single hotkey captures your display, downscales it 50% in-process, and sends it to a multimodal vision model to get an algorithmic approach and working code within ~10 seconds.

4. **Remains completely undetectable** — uses macOS `NSWindowSharingNone`, `LSUIElement`, and screen-saver level window layering to stay invisible to Zoom, Google Meet, Teams, WebEx, the Dock, and the Cmd+Tab switcher simultaneously.

---

## Architecture Overview

The application is structured around three independent async pipelines coordinated through Electron's IPC layer:

```
┌──────────────────────────────────────────────────────────┐
│                    macOS System Layer                      │
│  NSWindowSharingNone · LSUIElement · screen-saver level   │
└──────────────────────┬───────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────┐
│                 Electron Main Process                      │
│                     (main.js)                             │
│                                                           │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐  │
│  │ Audio Layer │  │  LLM Layer  │  │  Hotkey Registry │  │
│  │             │  │             │  │                  │  │
│  │ Deepgram WS │  │ OpenAI SDK  │  │  8 global        │  │
│  │ (mic)       │  │ (any compat │  │  shortcuts       │  │
│  │ Deepgram WS │  │  endpoint)  │  │                  │  │
│  │ (system)    │  │             │  │                  │  │
│  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘  │
│         └────────────────┼──────────────────┘            │
│                   IPC Bridge (preload.js)                 │
│              context-isolated · allowlisted               │
└──────────────────────┬───────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────┐
│              Electron Renderer (React 19 + Vite)          │
│                                                           │
│  ┌──────────┐  ┌───────────────┐  ┌──────────────────┐   │
│  │ Header   │  │ TranscriptLog │  │  SettingsPanel   │   │
│  │          │  │               │  │                  │   │
│  │ Mode dot │  │ Messages      │  │ 5 config fields  │   │
│  │ Settings │  │ Code blocks   │  │ electron-store   │   │
│  │ Close    │  │ Inline images │  │ persistence      │   │
│  └──────────┘  └───────────────┘  └──────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

---

## Audio Ingestion Pipeline

This is the most technically complex part of the application. Two completely independent audio streams are processed in parallel:

```
┌─────────────────────┐    ┌───────────────────────┐
│   Microphone Input  │    │  System Audio (Loopback)│
│  getUserMedia()     │    │  desktopCapturer +      │
│                     │    │  chromeMediaSource      │
└──────────┬──────────┘    └────────────┬────────────┘
           │                            │
           ▼                            ▼
┌──────────────────────────────────────────────────┐
│          AudioWorkletNode (per stream)            │
│       audio-processor.js (Float32 → IPC)         │
└──────────────────────┬───────────────────────────┘
                       │ IPC (sendMicAudioChunk /
                       │      sendSystemAudioChunk)
                       ▼
┌──────────────────────────────────────────────────┐
│              Electron Main Process               │
│   Float32 → Int16 PCM conversion (16kHz mono)   │
└────────────────┬─────────────┬───────────────────┘
                 │             │
                 ▼             ▼
        ┌────────────┐  ┌────────────┐
        │ Deepgram   │  │ Deepgram   │
        │ WS (mic)   │  │ WS (system)│
        │ label: You │  │ label:     │
        │            │  │ Interviewer│
        └─────┬──────┘  └─────┬──────┘
              │               │
              ▼               ▼
      mic-transcript    system-transcript
           IPC               IPC
              │               │
              ▼               ▼
      Question Accumulation State Machine
      ─────────────────────────────────
      • Buffer system-audio fragments
      • Wait for speech_final flag
      • Require > 10 chars + pause
      • Fire accumulated question → LLM
```

**Key implementation details:**

- **Sample rate:** 16,000 Hz, mono, Int16 PCM — the exact format Deepgram's Nova-2 expects
- **Keep-alive:** 10-second interval pings on both WebSocket connections to prevent timeouts during long pauses
- **Question accumulation:** `currentQuestion` string grows on each `system-transcript` event. On `speech_final` + length check, it's dispatched to the LLM and the buffer resets
- **Audio capture permission flow:** `requestScreenPermission()` triggers the macOS privacy dialog; `getDesktopSourceId()` fetches the screen source ID needed for `chromeMediaSource: 'desktop'`

---

## Vision Analysis Pipeline

Triggered by `⌘⇧⌥M`. The full round-trip from keypress to rendered answer takes ~10–12 seconds:

```
User presses ⌘⇧⌥M
       │
       ▼
desktopCapturer.getSources({ types: ['screen'] })
       │
       ▼
Raw high-resolution screenshot (up to 4K / ~4MB)
       │
       ▼
Node.js sharp — 50% downscale in-process (~1MB)
       │
       ▼
Base64 encode → data URL
       │
       ▼
OpenAI-compatible multimodal API call
  model: llmVisionModel || llmModel
  max_tokens: 4096
  messages:
    - system: "Analyze the problem and provide basic approach + code"
    - user:   [text prompt] + [image_url: data:image/png;base64,...]
       │
       ▼
Vision LLM response (markdown + code block)
       │
  IPC: llm-answer
       │
       ▼
TranscriptLog renders inline alongside transcript
```

**Why downscale locally?** Sending a raw 4K Retina screenshot added 25+ seconds of latency due to upload size. The sharp-based 50% resize happens in Node.js synchronously in under 100ms, reducing payload by ~75% while preserving all text legibility.

---

## Stealth Mode Implementation

The application uses a layered approach to remain invisible to both conference software and the OS UI:

| Mechanism | API Used | Effect |
|-----------|----------|--------|
| Window sharing exclusion | `setContentProtection(true)` → `NSWindowSharingNone` | Excluded from all screen/window capture APIs (Zoom, Meet, Teams, WebEx) |
| Always on top above capture layer | `setAlwaysOnTop(true, 'screen-saver')` | Floats above screen-sharing window layers visually but excluded from their capture buffer |
| OS UI invisibility | `LSUIElement = true` in Electron app init | Hidden from Cmd+Tab switcher and Force Quit menu |
| Dock hiding | `app.dock.hide()` | Never appears in the macOS Dock |
| Mouse passthrough | `setIgnoreMouseEvents(true, { forward: true })` | Clicks pass through to underlying app; overlay never intercepts cursor |
| Opacity indicator | 0.95 (stealth) vs 1.0 (normal) | Subtle visual cue for the user about current mode |

**Mode toggle (`⌘⇧⌥H`)** switches between:
- **Stealth mode:** `ignoreMouseEvents = true`, opacity 0.95, Settings panel hidden
- **Normal mode:** `ignoreMouseEvents = false`, opacity 1.0, Settings accessible

---

## Tech Stack

| Layer | Technology | Version | Why |
|-------|-----------|---------|-----|
| Desktop runtime | Electron | 40.6.1 | Bridges Chromium renderer with Node.js for low-level macOS API access |
| Frontend framework | React | 19.2.4 | Component model for reactive transcript/settings UI |
| Build tool | Vite | 7.3.1 | Sub-second HMR; vendor chunk splitting for lean bundles |
| Audio transcription | @deepgram/sdk | 4.11.3 | WebSocket streaming; Nova-2 model; `speech_final` events |
| LLM / Vision client | openai | 6.25.0 | OpenAI-compatible adapter pattern works with 7+ providers |
| Audio processing | AudioWorkletProcessor | Web API | Off-main-thread audio; avoids UI jank from ScriptProcessorNode |
| Image processing | sharp | (via Electron) | Synchronous 50% downscale before base64 upload |
| Settings persistence | electron-store | 8.2.0 | File-based key-value store; survives app restarts |
| Markdown rendering | Custom regex parser | — | Replaced react-markdown + react-syntax-highlighter; 78% smaller bundle |
| Process management | concurrently + wait-on | 9.2.1 / 9.0.4 | Parallel Vite + Electron dev startup with readiness sync |

---

## IPC Communication Layer

Electron's `contextBridge` exposes a minimal, allowlisted API to the renderer via `preload.js`. No Node.js APIs leak into the browser context.

### Renderer → Main (invokable from React)

```js
window.electron.startDeepgram()              // Initialize both WebSocket connections
window.electron.stopDeepgram()               // Tear down all connections
window.electron.sendMicAudioChunk(chunk)     // Forward Float32Array from mic worklet
window.electron.sendSystemAudioChunk(chunk)  // Forward Float32Array from system worklet
window.electron.resizeWindow(width, height)  // Dynamic overlay sizing
window.electron.setIgnoreMouseEvents(bool)   // Toggle click-through
window.electron.closeApp()                   // Quit
window.electron.getSettings()               // Fetch all persisted settings
window.electron.setSetting(key, value)      // Persist a single setting
window.electron.getDesktopSourceId()        // Get screen source for system audio
window.electron.requestScreenPermission()  // Trigger macOS permission dialog
```

### Main → Renderer (IPC events listened in App.jsx)

```js
deepgram-ready                 // Connections established
mic-transcript      → text     // Partial/final mic transcription
system-transcript   → text     // Partial/final system audio transcription
transcript-error    → message  // Connection or auth error
mode-changed        → 'stealth'|'normal'
hotkey-triggered               // ⌘⇧⌥M pressed, vision capture starting
capture-success     → base64   // Screenshot ready (inline preview)
llm-answer          → text     // LLM markdown response
dismiss-vision                 // ⌘⇧⌥D pressed
mic-toggle          → bool     // Mic on/off state
scroll-transcript   → 'up'|'down'
change-font-size    → delta    // ±1 font size increment
```

---

## React Component Architecture

### App.jsx — Root (125 lines)

Owns all application state and IPC subscriptions. No external state management library — React's `useState`/`useRef`/`useEffect` is sufficient for this scope.

**State:**
```js
messages     // Message[]  — full transcript history
mode         // 'stealth' | 'normal'
fontSize     // number     — relative font size, adjusted by hotkey
showSettings // boolean    — SettingsPanel visibility
```

**Key behaviors:**
- `addMessage(type, text, imageUrl?)` — appends to messages array; triggers window resize
- `resizeToFitContent()` — measures `transcriptRef.scrollHeight + 60px`, clamps to `screen.availHeight - 100px`
- All IPC listeners registered in a single `useEffect` on mount; properly cleaned up on unmount

---

### TranscriptLog.jsx — Message Display (89 lines)

Renders the conversation history with four distinct message types:

| Type | Visual Style | Source |
|------|-------------|--------|
| `ai` | Indigo background, left border, Markdown + code | LLM response |
| `user` | Light text, "You:" label | Mic transcription |
| `interviewer` | Light text, "Interviewer:" label | System audio transcription |
| `system` | Muted background | Status messages |

**Custom code block renderer** (replaced react-markdown + react-syntax-highlighter):
```js
// Splits on triple-backtick fences, renders alternating text/pre blocks
const parts = text.split(/```[\w]*\n?([\s\S]*?)```/g)
// Even indices = plain text, odd indices = code blocks
```

This reduced bundle size by ~78% and eliminated a significant render latency spike on first AI response.

**Inline image display:** When a message includes `imageUrl`, renders a 200px-wide preview of the captured screenshot above the AI response.

---

### Header.jsx — Title Bar (107 lines)

```
┌────────────────────────────────────────────┐
│ ● STEALTH  [draggable region]   ⚙   ✕    │
└────────────────────────────────────────────┘
```

- `WebkitAppRegion: 'drag'` on the title region; `-webkit-app-region: no-drag` on buttons
- Status dot: green (stealth) or orange (normal)
- Settings (⚙) and close (✕) buttons only visible in normal mode
- Pointer events pass through in stealth mode so the overlay doesn't block drags

---

### SettingsPanel.jsx — Configuration Form (80 lines)

In-app settings overlay, accessible only in normal mode via the ⚙ button.

| Field | Key | Type | Description |
|-------|-----|------|-------------|
| Deepgram API Key | `deepgramApiKey` | password | Auth for real-time transcription |
| LLM API Key | `llmApiKey` | password | Auth for text + vision LLM |
| LLM API URL | `llmApiUrl` | text | Base URL of any OpenAI-compatible endpoint |
| LLM Model | `llmModel` | text | Model identifier for text responses |
| LLM Vision Model | `llmVisionModel` | text | Optional override for vision requests (falls back to `llmModel`) |

Settings saved here via `window.electron.setSetting()` → `electron-store` → persist across restarts and take priority over `.env` values.

---

## Installation

**Requirements:**
- macOS (required — window stealth APIs are macOS-only)
- Node.js v18 or higher

```bash
git clone https://github.com/ubairrr/interview-helper.git
cd interview-helper
npm install
```

> [!IMPORTANT]
> On first launch, macOS will prompt for **Screen Recording** and **Microphone** permissions. Both are required. If the prompt doesn't appear, add the app manually at `System Settings → Privacy & Security → Screen Recording` and `Microphone`.

---

## Configuration

### Option A: Environment File (recommended for development)

```bash
cp .env.example .env
```

```env
DEEPGRAM_API_KEY=your_deepgram_api_key

LLM_API_KEY=your_llm_api_key
LLM_API_URL=https://generativelanguage.googleapis.com/v1beta/
LLM_MODEL=gemini-2.0-flash-lite

# Optional — only needed if vision model differs from text model
LLM_VISION_MODEL=gemini-2.0-flash
```

### Option B: In-App Settings Panel

Launch the app, press `⌘⇧⌥H` to enter normal mode, then click the ⚙ icon. Settings saved in-app override `.env` values.

### Configuration Priority

```
In-App Settings (electron-store)
        ↓ override
   .env file values
        ↓ override
   Hardcoded defaults
```

### Running

```bash
# Development (Vite HMR + Electron, hot-reload on save)
npm start

# Production build
npm run build
npm run start:prod
```

---

## Hotkey Reference

All hotkeys are globally registered and work regardless of which application has focus.

| Hotkey | Action |
|--------|--------|
| `⌘ ⇧ ⌥ M` | **Vision Assist** — capture screen, analyze with multimodal AI |
| `⌘ ⇧ ⌥ H` | **Toggle Mode** — switch between Stealth and Normal |
| `⌘ ⇧ ⌥ T` | **Toggle Mic** — enable/disable microphone transcription |
| `⌘ ⇧ ⌥ D` | **Dismiss Vision** — clear active vision analysis from transcript |
| `⌘ ⇧ ⌥ ↑` | **Scroll Up** — scroll transcript log upward |
| `⌘ ⇧ ⌥ ↓` | **Scroll Down** — scroll transcript log downward |
| `⌘ ⇧ ⌥ →` | **Font Size +** — increase transcript text size |
| `⌘ ⇧ ⌥ ←` | **Font Size −** — decrease transcript text size |

`⌘` Command · `⇧` Shift · `⌥` Option

---

## AI Provider Compatibility

The application uses the OpenAI SDK with a configurable `baseURL`, making it compatible with any provider that exposes a `/v1/chat/completions` endpoint.

| Provider | LLM API URL | Example Model |
|----------|-------------|---------------|
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/` | `gemini-2.0-flash-lite` |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | `meta/llama-3.2-90b-vision-instruct` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| OpenRouter | `https://openrouter.ai/api/v1` | `anthropic/claude-opus-4-8` |
| Ollama (local) | `http://localhost:11434/v1` | `llava` |
| LM Studio (local) | `http://localhost:1234/v1` | *(your loaded model)* |

> **Vision Assist requirement:** For screen analysis (`⌘⇧⌥M`) to work, the selected model must support image inputs. Text-only models handle transcription-based Q&A fine but will fail on screenshot payloads.

---

## Demo

> The overlay in action — floating translucent panel, live transcript with speaker labels, and an inline Vision AI analysis result. Completely invisible to screen-sharing software.

![Interview Helper Demo](assets/demo.png)

---

## Release Notes (v1.1.0)

### Unified Interface
- Vision analysis results now render inline in `TranscriptLog` alongside voice transcripts — no more separate panel
- `resizeToFitContent()` dynamically expands the overlay window as content grows, up to `screen.availHeight - 100px`

### "Fresher" AI Persona
- Refactored system prompts for both text and vision LLM pipelines
- Responses are now in plain English, <100 words, with a single code block (Python default) appended when relevant
- Spoken delivery target: ~45–60 seconds — sounds natural, not overqualified

### API Reliability
- `max_tokens` increased to 4096 — eliminates mid-sentence and mid-code truncation
- Removed `max_completion_tokens` parameter that caused `400 Bad Request` errors on non-OpenAI endpoints (Gemini, custom proxies)
- Settings panel now exposes all five configuration fields including a separate vision model override

### Performance
- Replaced `react-markdown` + `react-syntax-highlighter` with a custom regex-based code block parser
- Result: ~78% smaller bundle, near-zero first-render latency for AI responses

---

## Known Challenges & Solutions

**1. LLM firing mid-sentence**

Early versions triggered the LLM on every partial transcript fragment, producing incoherent half-responses. Solution: a question accumulation state machine that only dispatches when Deepgram emits `speech_final` AND the accumulated string exceeds 10 characters, ensuring the interviewer has finished their thought.

**2. Vision payload latency (25s → 10s)**

Raw 4K Retina screenshots weigh ~4MB and took 25+ seconds round-trip. Solution: Node.js `sharp` resizes by 50% synchronously in the main process before base64 encoding, reducing payload to ~1MB and cutting latency to 10–12 seconds.

**3. Stealth mode verification**

`NSWindowSharingNone` behavior had to be verified empirically across Zoom, Google Meet, Teams, and WebEx using isolated virtual environments, since the API's behavior is not perfectly documented and varies across software versions.

**4. System audio on macOS**

Standard `getUserMedia` cannot capture system audio on macOS. The workaround is `desktopCapturer.getSources()` combined with `chromeMediaSource: 'desktop'` constraints — an Electron-specific API that leverages the screen capture permission to also capture loopback audio.

---

## Future Roadmap

- **Windows support** — port stealth mechanisms using `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`
- **Fully local mode** — route all LLM calls through Ollama/LM Studio for zero network dependency and data privacy
- **IDE-aware capture** — instead of full-screen, detect and crop VS Code/IntelliJ window bounds for Vision Assist

---

## Contributing

Contributions welcome, especially for cross-platform stealth mechanisms.

```bash
git checkout -b feature/your-feature
git commit -m 'Add your feature'
git push origin feature/your-feature
# Open a Pull Request
```

---

## License

GNU General Public License v3.0 — see [LICENSE](LICENSE).

---

<div align="center">

**Built by [Mustafa Ubair](https://github.com/ubairrr)**

[LinkedIn](https://www.linkedin.com/in/mustafaubair) · [GitHub](https://github.com/ubairrr) · mustafaubair@gmail.com

</div>
