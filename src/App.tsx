import { useCallback, useEffect, useMemo, useState } from "react";
import { KnowledgeGraphViewer, graphifyAdapter } from "./index";
import { ManageIndexesModal } from "./ManageIndexesModal";
import { useWorkspaceConfig } from "./hooks/useWorkspaceConfig";
import { useIndexingJob } from "./hooks/useIndexingJob";
import type { KnowledgeGraphJson, RepoInfo } from "./types";

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

  // ── Load graph ───────────────────────────────────────────────
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

      // Use the exported graphifyAdapter to convert raw payload to canonical JSON contract
      const parsed = graphifyAdapter(text);

      setGraph(parsed);
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
        <div className="main-layout" style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <aside className="sidebar" style={{ width: "280px", flexShrink: 0, overflowY: "auto" }}>
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
          </aside>

          <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
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
              <KnowledgeGraphViewer
                graph={graph}
                isDark={isDark}
                title={selectedRepoName || "Knowledge Graph"}
              />
            )}
          </div>
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
