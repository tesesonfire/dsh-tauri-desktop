# dsh-tauri-desktop

[![CI](https://github.com/tesesonfire/dsh-tauri-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/tesesonfire/dsh-tauri-desktop/actions/workflows/ci.yml)
[![Release](https://github.com/tesesonfire/dsh-tauri-desktop/actions/workflows/release.yml/badge.svg)](https://github.com/tesesonfire/dsh-tauri-desktop/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-24C8D8)](https://v2.tauri.app/)

> Language: [中文](README.md) | **English**

**A native Tauri 2 desktop shell for dsh (DeepSeek Harness).** Zero environment
dependencies (no pre-installed Node.js / Docker required) — download and run.

## ✨ Features

- **Window & shell** — custom title bar (adaptive macOS traffic-light / Windows controls),
  multi-window, window-state persistence, system tray (minimize-to-tray, status menu),
  splash screen
- **Embedded dsh WebUI** — iframe loading `http://127.0.0.1:3080`, loading skeleton,
  auto-retry on disconnect (exponential backoff), 5-second heartbeat, one-click start when
  the service is down, live log panel (level filter + keyword search)
- **dsh core integration** — environment self-check (Node ≥ 18 / dsh detection), process
  lifecycle (start/stop/restart), crash auto-recovery (≤5 restarts with backoff), multi-version
  core management, core-outdated reminder (compares local to latest release on startup, silent
  when offline), auto-priority for CLI-installed dsh, profile isolation
- **Plugin system** — manifest spec, iframe isolation + postMessage bridge, permission
  allowlist (fs/exec/git/network/ui/storage/notification), plugin marketplace (official
  registry + GitHub community search + one-click zipball install/upgrade), right-side plugin
  panel dock
- **8 built-in plugins** — dsh-tauri (bridge), dsh-tauri-ui (theme), dsh-tauri-worktree (git
  worktree), dsh-tauri-panel (panel protocol), dsh-tauri-panel-extension (Skills/MCP),
  dsh-tauri-session (session archive), dsh-tauri-rightclick (context menu),
  dsh-tauri-notification (status notification)
- **CLI integration** — registers a `dsh` shim to PATH (Windows registry / macOS/Linux shell
  append)
- **App self-update** — GitHub Releases check, download progress, SHA256 verification,
  changelog Markdown rendering

## 🚀 Quick Start

### Install

Download the installer for your platform from
[Releases](https://github.com/tesesonfire/dsh-tauri-desktop/releases):

| Platform | Format | Approx. size | Requirements |
|---|---|---|---|
| Windows 10+ | `.exe` (NSIS) | ~4 MB | WebView2 (built-in) |
| macOS 10.15+ | `.dmg` (Universal) | ~11 MB | — |
| Linux | `.AppImage` / `.deb` | ~82 MB / ~7 MB | WebKitGTK 4.1 |

> The Linux AppImage is larger because it bundles the WebKitGTK runtime for a fully
> self-contained package with no extra dependencies; the `.deb` is ~7 MB (uses the
> system WebKitGTK).

### First launch

1. Splash → Onboarding wizard (welcome → preset plugin selection → dsh config → done)
2. Start the dsh service from the Activity Bar on the left
3. Once dsh is ready, the Web UI loads automatically in the main area

### Build from source

```bash
pnpm install
pnpm plugins:build    # build built-in plugins
pnpm tauri dev        # dev mode (Rust + Vite HMR)
```

Requirements: Node.js ≥ 20, pnpm ≥ 9, Rust ≥ 1.77 (Linux needs WebKitGTK dev packages, see
[DEVELOPMENT.md](docs/DEVELOPMENT.md)).

## 📖 Documentation

| Doc | Contents |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture (Mermaid), interface table, data models, state machine, postMessage protocol |
| [PLUGIN_API.md](docs/PLUGIN_API.md) | Plugin manifest spec, bridge API reference, minimal example plugin |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Environment setup, build commands, debugging, directory layout, contribution flow |
| [CLI.md](docs/CLI.md) | `dsh` CLI arguments and usage examples |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Install failures, plugin load failures, dsh start failures, Wayland black-screen |

## 🧩 Architecture overview

```
┌──────────────────────────────────────────────┐
│ Frontend React 18 + TS + Zustand + Tailwind │
│  UI components / pages / state / services /  │
│  plugin host                                 │
└──────────────┬───────────────────────────────┘
               │ invoke / event (IPC)
┌──────────────┴───────────────────────────────┐
│ Tauri Rust backend                          │
│  commands → services (workflow/core/profile/│
│  plugin/download/cli/update/notification)   │
└───────┬──────────────────────┬───────────────┘
        │                      │
  runtime/ (Node.js)    dependencies/dsh/
        └──────────┬───────────┘
                   ▼
      dsh web --profile <profile> --port 3080
                   ▼
        http://127.0.0.1:3080 ← embedded iframe
```

## 🧪 Testing & quality

```bash
pnpm test                 # frontend + plugin unit tests (Vitest)
pnpm test:coverage        # coverage report (coverage/)
cd src-tauri && cargo test   # Rust unit + service-layer integration
pnpm lint                 # ESLint
cd src-tauri && cargo clippy # Rust lint
```

## ⚠️ Known issues (release notes)

This is an open-source project; installers are **not code-signed / notarized**, so the
system may block first launch on each platform:

- **Windows SmartScreen**: running the NSIS installer shows a "Windows protected your PC"
  prompt — click "More info" → "Run anyway". This is expected for unsigned apps, not a virus.
- **macOS Gatekeeper**: opening the DMG may report "damaged" or "unidentified developer" —
  run `sudo xattr -rd com.apple.quarantine /Applications/dsh-tauri-desktop.app`.
- **Linux AppImage**: requires FUSE (`sudo apt-get install libfuse2`); the deb package needs
  WebKitGTK 4.1 (`sudo apt-get install libwebkit2gtk-4.1-0`).

For other issues (dsh start failure, plugin load failure, Wayland black screen, etc.), see
[TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## 🤝 Contributing

Contributions welcome! Read [CONTRIBUTING.md](CONTRIBUTING.md) (commit conventions,
development flow, testing requirements).

## 📄 License

[MIT](LICENSE) © 2026 dsh-tauri-desktop contributors
