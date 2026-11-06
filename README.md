# My Manager — Desktop Social Media Command Center

**My Manager** is an Electron + React + TypeScript desktop application for linking **Twitter / X, LinkedIn, YouTube, Instagram, and TikTok**, extracting live runtime statistics via a **local LLM (Ollama) + Playwright persistent browser**, and replicating single-video uploads with a title and description across all linked platforms.

## Features

1. **Five Linked Platforms & Brand Icons Everywhere**
   - Full support and custom SVG brand icons for **Twitter / X**, **LinkedIn**, **YouTube**, **Instagram**, and **TikTok** across the sidebar, header, account cards, live telemetry charts, and video replication pipeline.
2. **Local LLM Browser Statistics & Live Runtime Dashboard (`StatisticsTab`)**
   - Uses **Playwright** persistent browser context + **Ollama** (`http://127.0.0.1:11434`) to inspect creator analytics pages and stream live **Views**, **Likes**, and **Comments**.
   - Real-time ticking runtime counter, aggregate KPI cards, per-platform stat cards, and interactive **Recharts** time-series area and comparison bar graphs.
3. **Single-Video Multi-Platform Upload & Replication (`UploadVideoTab`)**
   - Select or drag-and-drop a single video file, enter a **Title**, **Description**, and **Hashtags**, and replicate the upload across all linked social platforms via persistent browser sessions.

## Getting Started

```bash
npm install
npm run build
npm start
```

For hot-reload development:

```bash
npm run electron:dev
```
