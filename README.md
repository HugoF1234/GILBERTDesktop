# Gilbert Desktop (Tauri)

Prototype desktop client built with Tauri (Rust backend + React/Vite frontend). The app focuses on:
- Audio recording (local buffer + temp file)
- Online/offline detection
- Local retry queue for uploads
- HTTP calls to ASR + LLM APIs
- Local storage of transcripts/summaries

## Getting started

Prerequisites: Rust toolchain (stable), Node 18+, pnpm/npm, and the Tauri system deps (Xcode CLT on macOS).

Install JS deps and run in dev:
```bash
cd desktop
npm install
npm run dev
```

Dev (sert le front Gilbert existant) :
```bash
# une fois les deps du frontend installées dans ../frontend
npm run tauri dev
```

Build distributables (utilise le build du dossier ../frontend/dist) :
```bash
npm run tauri build
```

## Config

`src-tauri/tauri.conf.json` sets the build paths and app metadata. The Tauri build/dev now sert le front `../frontend` (dev server :5173, dist : `../frontend/dist`). API endpoints/token are read from environment variables when the Rust process starts:
- `GILBERT_ASR_URL`
- `GILBERT_LLM_URL`
- `GILBERT_API_TOKEN`

The queue and temp audio files live in the platform data dir (see `AppDirs` in `src-tauri/src/config.rs`).

## Frontend

Vite + React + TypeScript in `src/`. The UI exposes Start/Stop recording, connectivity status, queue overview, and the latest transcript/summary.

## Rust backend

Key modules in `src-tauri/src/`:
- `recorder.rs`: audio capture (cpal + hound) to WAV temp file.
- `api.rs`: HTTP calls to ASR/LLM endpoints.
- `queue.rs`: local retry queue persisted as JSON + audio files.
- `network.rs`: simple online/offline probe.
- `state.rs`: shared state exposed through Tauri commands.

Tauri commands (see `main.rs`):
- `start_record`
- `stop_record`
- `get_status`
- `list_jobs`
- `retry_queue`
- `purge_successful`

> Note: endpoints/auth, file retention, and UI polish will likely need iteration once wired to real services.

