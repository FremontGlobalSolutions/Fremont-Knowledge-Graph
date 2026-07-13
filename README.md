# Knowledge Graph Viewer

Local standalone viewer for workspace knowledge graphs. Merges per-repo `graphify-out/graph.json` files into one combined graph and renders it with a 2D/3D force-graph stack.

## Prerequisites

Each repo must have a Graphify index at `<repo>/graphify-out/graph.json`. Refresh indexes from the agent platform:

```powershell
cd C:\src\agent-platform
npm run build
npm run graph:update:local -- -Workspace C:\src -AllRepos
```

## Quick start

```powershell
cd C:\src\knowledge-graph-viewer
npm install
npm run merge
npm run dev
```

The dev server opens at http://localhost:5199 and loads `public/graph.json`.

## Merge script

Combine all repos under `C:\src` that have `graphify-out/graph.json`:

```powershell
npm run merge
```

Options (via `node scripts/merge-graphs.mjs`):

| Flag | Description |
|------|-------------|
| `--workspace <path>` | Root folder to scan (default: `C:\src`) |
| `--repos a,b,c` | Comma-separated repo folder names only |
| `--out <path>` | Output file (default: `public/graph.json`) |

Example — merge two repos only:

```powershell
node scripts/merge-graphs.mjs --repos agent-platform,crm-app
```

The merge script:

- Normalizes Graphify NetworkX node-link JSON (`nodes` + `links`)
- Namespaces node ids as `RepoName::nodeId` to avoid collisions
- Tags each node with a `repo` field for filtering/coloring
- **Infers cross-repo links** by scanning TypeScript/JavaScript imports against workspace `package.json` names
- Adds **repo hub** and **package entry** synthetic nodes for repos without a Graphify index
- Adds **package.json dependency** edges between repo hubs
- Writes `{ nodes, edges, metadata }` with per-repo and cross-repo stats

Cross-repo edges appear as **dashed magenta/pink links** in the viewer. Solid links remain within-repo.

### Cross-repo linking details

| Link type | How it's inferred |
|-----------|-------------------|
| `cross_repo_import` | Source file imports a workspace package (e.g. `@workspace/locale-switcher`) → linked to the target file node or package entry node |
| `cross_repo_depends` | `package.json` dependency on another workspace package → linked between repo hub nodes |

Repos without `graphify-out/graph.json` still participate via the package registry (imports can target their package entry nodes). Run `graph:update:local` on those repos to get full file-level graphs.

## Viewer features

- **2D / 3D** force-graph rendering (`react-force-graph-2d` / `react-force-graph-3d`)
- **Search** and **folder prefix** filters
- **Repo legend** — click to hide/show repos; nodes colored by repo
- **Node inspector** — click a node to see metadata and connections
- **Drag-and-drop** or file picker to load any `graph.json` (single-repo Graphify export or merged file)
- **Light / dark** theme toggle

## Production build

```powershell
npm run merge
npm run build
npm run preview
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "No graph.json found" | Run `npm run merge` first |
| Repo missing from merge | Ensure `<repo>/graphify-out/graph.json` exists; re-run `graph:update:local` |
| Slow 3D with large graphs | Use 2D mode or filter by repo/folder first |
| Node id collisions in single-repo view | Expected when viewing raw per-repo files; use merged output for workspace-wide view |
