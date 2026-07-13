import { useCallback, useEffect, useMemo, useState } from "react";
import { GraphCanvas } from "./GraphCanvas";
import { parseGraphJson } from "./normalize-graphify";
import { NodeInspector } from "./NodeInspector";
import { FullscreenCanvasFrame } from "./FullscreenCanvasFrame";
import type { GraphRenderMode, KnowledgeGraphJson, KnowledgeGraphNode } from "./types";

interface RepoInfo {
  name: string;
  path: string;
  hasGraph: boolean;
  isGit: boolean;
  nodeCount: number;
  edgeCount: number;
  indexedAt: string | null;
}

interface IndexingJob {
  repo: string;
  status: "running" | "success" | "error";
  startTime: string;
  endTime?: string;
  error?: string;
}

function graphStats(graph: KnowledgeGraphJson) {
  const metadata = graph.metadata ?? {};
  const totalNodeCount =
    typeof metadata.totalNodeCount === "number" ? metadata.totalNodeCount : graph.nodes.length;
  const totalEdgeCount =
    typeof metadata.totalEdgeCount === "number" ? metadata.totalEdgeCount : graph.edges.length;
  return { totalNodeCount, totalEdgeCount };
}

export function App() {
  const [graph, setGraph] = useState<KnowledgeGraphJson | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [selectedNode, setSelectedNode] = useState<KnowledgeGraphNode | null>(null);
  const [mode, setMode] = useState<GraphRenderMode>("2d");
  const [isDark, setIsDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  // Workspace configuration & Repository states
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [tempWorkspaceRoot, setTempWorkspaceRoot] = useState("");
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [selectedRepoName, setSelectedRepoName] = useState<string | null>(null);
  const [showManageIndexes, setShowManageIndexes] = useState(false);
  const [activeJob, setActiveJob] = useState<IndexingJob | null>(null);

  // Selection states for batch indexing picker
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [indexingQueue, setIndexingQueue] = useState<string[]>([]);

  const stats = graph ? graphStats(graph) : null;
  const indexedRepos = useMemo(() => repos.filter((r) => r.hasGraph), [repos]);
  const hiddenRepos = useMemo(() => new Set<string>(), []);

  // Fetch initial config & repositories list
  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/config");
      if (res.ok) {
        const data = await res.json();
        setWorkspaceRoot(data.workspaceRoot);
      }
    } catch (e) {
      console.error("Failed to fetch config:", e);
    }
  };

  const fetchRepos = async () => {
    try {
      const res = await fetch("/api/repos");
      if (res.ok) {
        const data = await res.json();
        setRepos(data.repos || []);
      }
    } catch (e) {
      console.error("Failed to fetch repos:", e);
    }
  };

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await fetchConfig();
      await fetchRepos();

      // Check if there is an active job running on startup
      try {
        const res = await fetch("/api/reindex/status");
        if (res.ok) {
          const data = await res.json();
          if (data.status === "running") {
            setActiveJob(data);
          }
        }
      } catch {}

      setLoading(false);
    })();
  }, []);

  // Synchronize temp workspace root state when workspace root changes
  useEffect(() => {
    setTempWorkspaceRoot(workspaceRoot);
  }, [workspaceRoot]);

  // Clear selections whenever workspace configuration or repos list changes
  useEffect(() => {
    setSelectedFolders(new Set());
    setIndexingQueue([]);
  }, [workspaceRoot, repos]);

  // Select the first indexed repository by default if nothing is selected
  useEffect(() => {
    if (!selectedRepoName && indexedRepos.length > 0) {
      setSelectedRepoName(indexedRepos[0]!.name);
    }
  }, [indexedRepos, selectedRepoName]);

  // Load selected repository graph
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
      const parsed = parseGraphJson(text);

      // Normalize nodes by assigning a repo tag if missing
      parsed.nodes = parsed.nodes.map((node) => ({
        ...node,
        repo: node.repo || repoName,
      }));

      setGraph(parsed);
      setSelectedNode(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load graph");
      setGraph(null);
    } finally {
      setLoadingGraph(false);
    }
  }, []);

  // Reload/Fetch graph whenever selectedRepoName changes
  useEffect(() => {
    if (selectedRepoName) {
      void loadGraph(selectedRepoName);
    } else {
      setGraph(null);
    }
  }, [selectedRepoName, loadGraph]);

  // Polling index job status
  useEffect(() => {
    let intervalId: any;

    const checkStatus = async () => {
      try {
        const res = await fetch("/api/reindex/status");
        if (res.ok) {
          const data: IndexingJob = await res.json();
          if (data.status === "running") {
            setActiveJob(data);
          } else if (data.status === "success" || data.status === "error") {
            setActiveJob(data);
            // Refresh repo list to see new index metadata
            void fetchRepos();
            // If the completed job is for the current repo, reload its graph
            if (data.status === "success" && data.repo === selectedRepoName) {
              void loadGraph(data.repo);
            }
          } else {
            setActiveJob(null);
          }
        }
      } catch (e) {
        console.error("Error fetching job status:", e);
      }
    };

    if (activeJob && activeJob.status === "running") {
      intervalId = setInterval(checkStatus, 2000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [activeJob?.status, selectedRepoName, loadGraph]);

  // Trigger indexing for a repository
  const handleReindex = async (repoName: string, force = false) => {
    try {
      const res = await fetch("/api/reindex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: repoName, force }),
      });
      if (res.ok) {
        setActiveJob({
          repo: repoName,
          status: "running",
          startTime: new Date().toISOString(),
        });
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to start indexing");
      }
    } catch (err) {
      console.error(err);
      alert("Error starting indexing");
    }
  };

  // Clear indexing job status panel
  const handleClearJob = async () => {
    try {
      await fetch("/api/reindex/status", { method: "POST" });
      setActiveJob(null);
    } catch {}
  };

  const handleToggleFolder = (folderName: string) => {
    setSelectedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderName)) {
        next.delete(folderName);
      } else {
        next.add(folderName);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedFolders.size === repos.length) {
      setSelectedFolders(new Set());
    } else {
      setSelectedFolders(new Set(repos.map((r) => r.name)));
    }
  };

  const handleBuildSelected = () => {
    const list = Array.from(selectedFolders);
    if (list.length === 0) return;
    setIndexingQueue(list);
  };

  // Batch indexing queue effect
  useEffect(() => {
    if (indexingQueue.length > 0 && (!activeJob || activeJob.status !== "running")) {
      if (activeJob && (activeJob.status === "success" || activeJob.status === "error")) {
        const nextQueue = indexingQueue.slice(1);
        setIndexingQueue(nextQueue);
        void handleClearJob();
      } else {
        const nextFolder = indexingQueue[0];
        if (nextFolder) {
          void handleReindex(nextFolder);
        }
      }
    }
  }, [indexingQueue, activeJob]);

  // Save workspace root path
  const handleSaveConfig = async () => {
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceRoot: tempWorkspaceRoot }),
      });
      if (res.ok) {
        const data = await res.json();
        setWorkspaceRoot(data.workspaceRoot);
        setSelectedRepoName(null);
        setGraph(null);
        await fetchRepos();
      }
    } catch {
      alert("Failed to save workspace root");
    }
  };

  const handleSelectNeighbor = useCallback(
    (nodeId: string) => {
      const neighbor = graph?.nodes.find((n) => n.id === nodeId);
      if (neighbor) setSelectedNode(neighbor);
    },
    [graph]
  );

  return (
    <div className={`app${isDark ? " app--dark" : ""}`}>
      <header className="app-header">
        <div className="app-header-left">
          <h1 className="app-title">Knowledge Graph Viewer</h1>
          {stats && selectedRepoName ? (
            <span className="app-stats">
              Viewing <strong>{selectedRepoName}</strong>: {stats.totalNodeCount.toLocaleString()} nodes ·{" "}
              {stats.totalEdgeCount.toLocaleString()} edges
              {activeJob?.repo === selectedRepoName && activeJob?.status === "running" ? (
                <span className="badge badge--running">Indexing...</span>
              ) : (
                <button
                  type="button"
                  className="btn-inline-action"
                  onClick={() => handleReindex(selectedRepoName)}
                  disabled={activeJob?.status === "running"}
                >
                  (Reindex)
                </button>
              )}
            </span>
          ) : (
            selectedRepoName && <span className="app-stats">Loading graph for {selectedRepoName}...</span>
          )}
        </div>
        <div className="app-header-right">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowManageIndexes(true)}
          >
            Manage Indexes
          </button>
          <button type="button" className="btn-secondary" onClick={() => setIsDark((d) => !d)}>
            {isDark ? "Light" : "Dark"}
          </button>
        </div>
      </header>

      {loading && <p className="status-msg">Loading workspace...</p>}
      {!loading && loadError && !graph && <p className="status-msg status-msg--error">{loadError}</p>}

      {!loading && (
        <div className="main-layout">
          <aside className="sidebar">
            <div className="sidebar-section">
              <div className="sidebar-section-header">
                <span className="sidebar-section-title">Repositories ({indexedRepos.length})</span>
              </div>

              {indexedRepos.length === 0 ? (
                <div className="no-repos-box">
                  <p className="no-repos-msg">No indexed repos found.</p>
                  <button
                    type="button"
                    className="btn-secondary btn-sm w-full"
                    onClick={() => setShowManageIndexes(true)}
                  >
                    Index Repositories
                  </button>
                </div>
              ) : (
                <ul className="repo-list">
                  {indexedRepos.map((repo) => {
                    const active = repo.name === selectedRepoName;
                    return (
                      <li key={repo.name}>
                        <button
                          type="button"
                          className={`repo-list-item${active ? " repo-list-item--active" : ""}`}
                          onClick={() => setSelectedRepoName(repo.name)}
                        >
                          <div className="repo-list-item-main">
                            <span className="repo-list-item-name">{repo.name}</span>
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
                <GraphCanvas
                  graph={graph}
                  search={search}
                  folderFilter={folderFilter}
                  hiddenRepos={hiddenRepos}
                  repos={indexedRepos.map((r) => r.name)}
                  selectedNodeId={selectedNode?.id ?? null}
                  mode={mode}
                  isDark={isDark}
                  onSelectNode={setSelectedNode}
                />
              </FullscreenCanvasFrame>
            )}
          </main>
        </div>
      )}

      {showManageIndexes && (
        <div className="modal-overlay" onClick={() => {
          if (activeJob?.status !== "running") setShowManageIndexes(false);
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Manage Repositories</h2>
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowManageIndexes(false)}
                disabled={activeJob?.status === "running"}
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              <div className="config-group">
                <label className="config-label">Workspace Root Path</label>
                <div className="config-input-row">
                  <input
                    type="text"
                    className="config-input"
                    value={tempWorkspaceRoot}
                    onChange={(e) => setTempWorkspaceRoot(e.target.value)}
                    disabled={activeJob?.status === "running"}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSaveConfig}
                    disabled={activeJob?.status === "running" || tempWorkspaceRoot === workspaceRoot}
                  >
                    Save
                  </button>
                </div>
                <span className="config-hint">Repositories under this directory will be detected.</span>
              </div>

              {activeJob && (
                <div className={`job-panel job-panel--${activeJob.status}`}>
                  <div className="job-header">
                    <strong>Indexing: {activeJob.repo}</strong>
                    <span className="job-status-text">
                      {activeJob.status === "running" ? "Running..." : activeJob.status === "success" ? "Completed" : "Failed"}
                    </span>
                  </div>
                  {activeJob.error && (
                    <pre className="job-error-log">{activeJob.error}</pre>
                  )}
                  {activeJob.status !== "running" && (
                    <button
                      type="button"
                      className="btn-secondary btn-sm mt-2"
                      onClick={handleClearJob}
                    >
                      Dismiss status
                    </button>
                  )}
                </div>
              )}

              {indexingQueue.length > 0 && (
                <div className="queue-status-panel">
                  <span className="queue-status-text">
                    Queue active: indexing <strong>{indexingQueue[0]}</strong> ({indexingQueue.length} folders remaining)
                  </span>
                  <button
                    type="button"
                    className="btn-danger btn-sm"
                    onClick={() => {
                      setIndexingQueue([]);
                    }}
                  >
                    Cancel Queue
                  </button>
                </div>
              )}

              <div className="detected-repos-section">
                <div className="section-header-row">
                  <h3 className="section-title">Detected Folders ({repos.length})</h3>
                  <div className="batch-actions-row">
                    <label className="checkbox-label-all">
                      <input
                        type="checkbox"
                        checked={repos.length > 0 && selectedFolders.size === repos.length}
                        onChange={handleSelectAll}
                        disabled={activeJob?.status === "running" || indexingQueue.length > 0}
                      />
                      <span>Select All</span>
                    </label>
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={handleBuildSelected}
                      disabled={selectedFolders.size === 0 || activeJob?.status === "running" || indexingQueue.length > 0}
                    >
                      Build Selected ({selectedFolders.size})
                    </button>
                  </div>
                </div>
                <ul className="detected-repos-list">
                  {repos.map((repo) => {
                    const isIndexingCurrent = activeJob?.repo === repo.name && activeJob.status === "running";
                    const isChecked = selectedFolders.has(repo.name);
                    const isQueued = indexingQueue.includes(repo.name);
                    return (
                      <li key={repo.name} className={`detected-repo-item ${isQueued ? "queued" : ""}`}>
                        <div className="repo-checkbox-and-meta">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleFolder(repo.name)}
                            disabled={activeJob?.status === "running" || indexingQueue.length > 0}
                            className="repo-checkbox"
                          />
                          <div className="repo-meta">
                            <div className="repo-name-and-badge">
                              <span className="repo-meta-name">{repo.name}</span>
                              {repo.isGit ? (
                                <span className="badge badge--git">Git</span>
                              ) : (
                                <span className="badge badge--folder">Folder</span>
                              )}
                            </div>
                            <span className="repo-meta-status">
                              {repo.hasGraph ? (
                                <span className="badge badge--indexed">
                                  Indexed ({repo.nodeCount} nodes · {repo.edgeCount} edges)
                                </span>
                              ) : (
                                <span className="badge badge--not-indexed">Not Indexed</span>
                              )}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => handleReindex(repo.name)}
                          disabled={activeJob?.status === "running" || indexingQueue.length > 0}
                        >
                          {isIndexingCurrent ? "Indexing..." : isQueued ? "Queued" : repo.hasGraph ? "Rebuild Index" : "Build Index"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
