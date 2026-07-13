import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { NodeInspector } from "./NodeInspector";
import { FullscreenCanvasFrame } from "./FullscreenCanvasFrame";
import { ErrorBoundary } from "./ErrorBoundary";
import { ManageIndexesModal } from "./ManageIndexesModal";
import { useWorkspaceConfig } from "./hooks/useWorkspaceConfig";
import { useIndexingJob } from "./hooks/useIndexingJob";
import type { GraphRenderMode, KnowledgeGraphJson, KnowledgeGraphNode, RepoInfo } from "./types";

// Lazy-load GraphCanvas — it pulls in react-force-graph-2d (and
// optionally 3D/three.js), which are the heaviest dependencies.
const GraphCanvas = lazy(() =>
  import("./GraphCanvas").then((m) => ({ default: m.GraphCanvas }))
);

function graphStats(graph: KnowledgeGraphJson) {
  const metadata = graph.metadata ?? {};
  const totalNodeCount =
    typeof metadata.totalNodeCount === "number" ? metadata.totalNodeCount : graph.nodes.length;
  const totalEdgeCount =
    typeof metadata.totalEdgeCount === "number" ? metadata.totalEdgeCount : graph.edges.length;
  return { totalNodeCount, totalEdgeCount };
}

export function App() {
  // ── Graph display state ──────────────────────────────────────
  const [graph, setGraph] = useState<KnowledgeGraphJson | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [selectedNode, setSelectedNode] = useState<KnowledgeGraphNode | null>(null);
  const [mode, setMode] = useState<GraphRenderMode>("2d");
  const [isDark, setIsDark] = useState(() => {
    const themeParam = new URLSearchParams(window.location.search).get("theme");
    if (themeParam === "dark") return true;
    if (themeParam === "light") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  // ── Repos state ──────────────────────────────────────────────
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [selectedRepoName, setSelectedRepoName] = useState<string | null>(null);
  const [showManageIndexes, setShowManageIndexes] = useState(false);

  // ── Extracted hooks ──────────────────────────────────────────
  const config = useWorkspaceConfig();
  const indexingJob = useIndexingJob(
    useCallback(
      (repoName: string) => {
        // Refresh repo list on successful index
        void fetchRepos();
        if (repoName === selectedRepoName) {
          void loadGraph(repoName);
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [selectedRepoName]
    )
  );

  // ── Derived state ────────────────────────────────────────────
  const stats = graph ? graphStats(graph) : null;
  const indexedRepos = useMemo(() => repos.filter((r) => r.hasGraph), [repos]);
  const sidebarRepos = useMemo(() => {
    const allowed = new Set(config.visibleRepos);
    return indexedRepos.filter((r) => allowed.has(r.name));
  }, [indexedRepos, config.visibleRepos]);
  const hiddenRepos = useMemo(() => new Set<string>(), []);

  // ── Theme URL sync ───────────────────────────────────────────
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("theme", isDark ? "dark" : "light");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [isDark]);

  // ── Fetch repos ──────────────────────────────────────────────
  const fetchRepos = useCallback(async () => {
    try {
      const res = await fetch("/api/repos");
      if (res.ok) {
        const data = await res.json();
        setRepos(data.repos || []);
      }
    } catch (e) {
      console.error("Failed to fetch repos:", e);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void fetchRepos();
  }, [fetchRepos]);

  // ── Auto-select first sidebar repo ───────────────────────────
  useEffect(() => {
    if (!selectedRepoName && sidebarRepos.length > 0) {
      setSelectedRepoName(sidebarRepos[0]!.name);
    } else if (
      selectedRepoName &&
      sidebarRepos.length > 0 &&
      !sidebarRepos.some((r) => r.name === selectedRepoName)
    ) {
      setSelectedRepoName(sidebarRepos[0]!.name);
    } else if (selectedRepoName && sidebarRepos.length === 0) {
      setSelectedRepoName(null);
    }
  }, [sidebarRepos, selectedRepoName]);

  // ── Load graph (Web Worker for parsing) ──────────────────────
  const loadGraph = useCallback(async (repoName: string) => {
    setLoadingGraph(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/graph?repo=${encodeURIComponent(repoName)}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `Failed to load graph for ${repoName}`);
      }
      const text = await res.text();

      // Parse in a Web Worker to avoid blocking the main thread
      const parsed = await new Promise<KnowledgeGraphJson>((resolve, reject) => {
        const worker = new Worker(
          new URL("./workers/graph-parser.worker.ts", import.meta.url),
          { type: "module" }
        );
        worker.onmessage = (event) => {
          worker.terminate();
          if (event.data.type === "success") {
            resolve(event.data.data);
          } else {
            reject(new Error(event.data.error));
          }
        };
        worker.onerror = (err) => {
          worker.terminate();
          reject(new Error(err.message));
        };
        worker.postMessage({ text, repoName });
      });

      setGraph(parsed);
      setSelectedNode(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load graph");
      setGraph(null);
    } finally {
      setLoadingGraph(false);
    }
  }, []);

  // Reload graph when selected repo changes
  useEffect(() => {
    if (selectedRepoName) {
      void loadGraph(selectedRepoName);
    } else {
      setGraph(null);
    }
  }, [selectedRepoName, loadGraph]);

  // ── Node selection helpers ───────────────────────────────────
  const handleSelectNeighbor = useCallback(
    (nodeId: string) => {
      const neighbor = graph?.nodes.find((n) => n.id === nodeId);
      if (neighbor) setSelectedNode(neighbor);
    },
    [graph]
  );

  // ── Manage modal callbacks ───────────────────────────────────
  const handleSaveWorkspaceRoot = useCallback(
    async (root: string) => {
      const ok = await config.saveWorkspaceRoot(root);
      if (ok) {
        setSelectedRepoName(null);
        setGraph(null);
      }
      return ok;
    },
    [config]
  );

  return (
    <div className={`app${isDark ? " app--dark" : ""}`}>
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="app-header">
        <div className="app-header-left">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true">
              <span />
            </div>
            <div className="brand-copy">
              <span className="app-eyebrow">Fremont AgentOps Lab</span>
              <h1 className="app-title">Knowledge Graph Viewer</h1>
            </div>
          </div>
          <div className="app-subtitle-row">
            <span className="app-subtitle">
              Map codebases into local 2D and 3D dependency graphs.
            </span>
            {stats && selectedRepoName ? (
              <span className="app-stats">
                <strong>{selectedRepoName}</strong>
                <span>{stats.totalNodeCount.toLocaleString()} nodes</span>
                <span>{stats.totalEdgeCount.toLocaleString()} edges</span>
                {indexingJob.activeJob?.repo === selectedRepoName &&
                indexingJob.isIndexing ? (
                  <span className="badge badge--running">Indexing...</span>
                ) : (
                  <button
                    type="button"
                    className="btn-inline-action"
                    onClick={() => indexingJob.startReindex(selectedRepoName)}
                    disabled={indexingJob.isIndexing}
                  >
                    Reindex
                  </button>
                )}
              </span>
            ) : (
              selectedRepoName && (
                <span className="app-stats">
                  Loading graph for {selectedRepoName}...
                </span>
              )
            )}
          </div>
        </div>
        <div className="app-header-right">
          <a
            className="agentops-link"
            href="https://fremontagentops.com"
            target="_blank"
            rel="noreferrer"
          >
            AgentOps
          </a>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowManageIndexes(true)}
          >
            Manage Indexes
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setIsDark((d) => !d)}
          >
            {isDark ? "Light" : "Dark"}
          </button>
        </div>
      </header>

      {/* ── Loading / Error states ──────────────────────────── */}
      {config.loading && <p className="status-msg">Loading workspace...</p>}
      {!config.loading && loadError && !graph && (
        <p className="status-msg status-msg--error">{loadError}</p>
      )}

      {/* ── Main layout ─────────────────────────────────────── */}
      {!config.loading && (
        <div className="main-layout">
          <aside className="sidebar">
            <div className="sidebar-section">
              <div className="sidebar-section-header">
                <span className="sidebar-section-title">
                  Repositories ({sidebarRepos.length})
                </span>
              </div>

              {sidebarRepos.length === 0 ? (
                <div className="no-repos-box">
                  <p className="no-repos-msg">
                    {indexedRepos.length === 0
                      ? "No indexed repos found."
                      : "No repositories selected for the sidebar."}
                  </p>
                  <button
                    type="button"
                    className="btn-secondary btn-sm w-full"
                    onClick={() => setShowManageIndexes(true)}
                  >
                    {indexedRepos.length === 0
                      ? "Index Repositories"
                      : "Choose Sidebar Repos"}
                  </button>
                </div>
              ) : (
                <ul className="repo-list">
                  {sidebarRepos.map((repo) => {
                    const active = repo.name === selectedRepoName;
                    return (
                      <li key={repo.name}>
                        <button
                          type="button"
                          className={`repo-list-item${active ? " repo-list-item--active" : ""}`}
                          onClick={() => setSelectedRepoName(repo.name)}
                        >
                          <div className="repo-list-item-main">
                            <span className="repo-list-item-name">
                              {repo.name}
                            </span>
                            <span className="repo-list-item-stats">
                              {repo.nodeCount.toLocaleString()} nodes ·{" "}
                              {repo.edgeCount.toLocaleString()} edges
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {selectedNode && graph && (
              <NodeInspector
                node={selectedNode}
                graph={graph}
                onSelectNeighbor={handleSelectNeighbor}
              />
            )}
          </aside>

          <main className="graph-panel">
            {loadingGraph && (
              <div className="graph-panel-status">
                <p>Loading graph...</p>
              </div>
            )}
            {!loadingGraph && !graph && (
              <div className="graph-panel-status">
                <p>Select a repository in the sidebar to view its graph.</p>
              </div>
            )}
            {graph && (
              <FullscreenCanvasFrame
                title={selectedRepoName || "Knowledge Graph"}
                isDark={isDark}
                toolbar={
                  <>
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Filter nodes..."
                      className="toolbar-input"
                    />
                    <input
                      value={folderFilter}
                      onChange={(e) => setFolderFilter(e.target.value)}
                      placeholder="Folder filter (e.g. src/)"
                      className="toolbar-input"
                    />
                    <div className="mode-toggle">
                      <button
                        type="button"
                        className={`mode-btn${mode === "2d" ? " mode-btn--active" : ""}`}
                        onClick={() => setMode("2d")}
                      >
                        2D
                      </button>
                      <button
                        type="button"
                        className={`mode-btn${mode === "3d" ? " mode-btn--active" : ""}`}
                        onClick={() => setMode("3d")}
                      >
                        3D
                      </button>
                    </div>
                  </>
                }
              >
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <div className="graph-panel-status">
                        <p>Loading graph renderer...</p>
                      </div>
                    }
                  >
                    <GraphCanvas
                      graph={graph}
                      search={search}
                      folderFilter={folderFilter}
                      hiddenRepos={hiddenRepos}
                      repos={sidebarRepos.map((r) => r.name)}
                      selectedNodeId={selectedNode?.id ?? null}
                      mode={mode}
                      isDark={isDark}
                      onSelectNode={setSelectedNode}
                    />
                  </Suspense>
                </ErrorBoundary>
              </FullscreenCanvasFrame>
            )}
          </main>
        </div>
      )}

      {/* ── Manage Indexes Modal ────────────────────────────── */}
      {showManageIndexes && (
        <ManageIndexesModal
          repos={repos}
          indexedRepos={indexedRepos}
          workspaceRoot={config.workspaceRoot}
          visibleRepos={config.visibleRepos}
          activeJob={indexingJob.activeJob}
          indexingQueue={indexingJob.indexingQueue}
          isIndexing={indexingJob.isIndexing}
          onSaveWorkspaceRoot={handleSaveWorkspaceRoot}
          onSaveVisibleRepos={config.saveVisibleRepos}
          onReindex={indexingJob.startReindex}
          onBuildSelected={indexingJob.startBatchReindex}
          onClearJob={indexingJob.clearJob}
          onCancelQueue={indexingJob.cancelQueue}
          onClose={() => setShowManageIndexes(false)}
          onRefreshRepos={fetchRepos}
        />
      )}
    </div>
  );
}
