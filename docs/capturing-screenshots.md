# Regenerating README media

Screenshots and the demo GIF live in [`docs/assets/`](assets/).

## Prerequisites

- Node.js 18+
- A running dev server (`npm run dev` → http://localhost:5199)
- At least one indexed repo under your workspace (`graphify-out/graph.json`)
- [Playwright MCP](https://github.com/microsoft/playwright-mcp) or Playwright CLI

## Configure the sidebar (optional)

Copy [`.viewer-config.example.json`](../.viewer-config.example.json) to `.viewer-config.json` and set:

- `workspaceRoot` — folder containing your git repos
- `visibleRepos` — only these repos appear in the left pane (useful for clean screenshots)

Example:

```json
{
  "workspaceRoot": "C:\\src",
  "visibleRepos": ["knowledge-graph-viewer", "Fremont-Locale-Switcher"]
}
```

Restart the dev server after changing config.

## Capture with Playwright MCP

1. Start the viewer: `npm run dev`
2. Open http://localhost:5199 in Playwright (viewport **1440×900**)
3. Switch to **Dark** theme
4. Select a repo with a readable graph size (avoid huge monorepos for marketing shots)
5. Wait ~4s for the 2D layout to settle → save `docs/assets/graph-2d.png`
6. Click **3D**, wait ~5s → save `docs/assets/graph-3d.png`
7. Capture 4–6 frames while toggling **2D ↔ 3D** (1.5–2s between frames) as `docs/assets/gif-frame-00.png`, `gif-frame-01.png`, …

## Build the GIF

```bash
node scripts/make-readme-gif.mjs
```

This writes `docs/assets/graph-demo.gif` and removes temporary `gif-frame-*.png` files.

## Tips

- Prefer repos with a few hundred nodes for clear visuals
- Use `visibleRepos` so the sidebar only lists repos you want in the shot
- Keep PNG/GIF files under ~500 KB each when possible (compress if needed)
