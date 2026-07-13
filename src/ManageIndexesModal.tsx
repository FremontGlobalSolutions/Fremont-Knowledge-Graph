import { useEffect, useState } from "react";
import type { RepoInfo, IndexingJob } from "./types";

type Props = {
  repos: RepoInfo[];
  indexedRepos: RepoInfo[];
  workspaceRoot: string;
  visibleRepos: string[];
  activeJob: IndexingJob | null;
  indexingQueue: string[];
  isIndexing: boolean;
  onSaveWorkspaceRoot: (root: string) => Promise<boolean>;
  onSaveVisibleRepos: (repos: string[]) => Promise<boolean>;
  onReindex: (repo: string) => void;
  onBuildSelected: (repos: string[]) => void;
  onClearJob: () => void;
  onCancelQueue: () => void;
  onClose: () => void;
  onRefreshRepos: () => void;
};

export function ManageIndexesModal({
  repos,
  indexedRepos,
  workspaceRoot,
  visibleRepos,
  activeJob,
  indexingQueue,
  isIndexing,
  onSaveWorkspaceRoot,
  onSaveVisibleRepos,
  onReindex,
  onBuildSelected,
  onClearJob,
  onCancelQueue,
  onClose,
  onRefreshRepos,
}: Props) {
  const [tempWorkspaceRoot, setTempWorkspaceRoot] = useState(workspaceRoot);
  const [tempVisibleRepos, setTempVisibleRepos] = useState<Set<string>>(
    new Set(visibleRepos)
  );
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());

  // Sync temp state when props change
  useEffect(() => {
    setTempWorkspaceRoot(workspaceRoot);
  }, [workspaceRoot]);

  useEffect(() => {
    setTempVisibleRepos(new Set(visibleRepos));
  }, [visibleRepos]);

  // Clear folder selections when repos change
  useEffect(() => {
    setSelectedFolders(new Set());
  }, [workspaceRoot, repos]);

  const handleSaveConfig = async () => {
    const ok = await onSaveWorkspaceRoot(tempWorkspaceRoot);
    if (ok) {
      onRefreshRepos();
    }
  };

  const handleSaveVisibleRepos = async () => {
    await onSaveVisibleRepos(Array.from(tempVisibleRepos));
  };

  const handleToggleSidebarRepo = (repoName: string) => {
    setTempVisibleRepos((prev) => {
      const next = new Set(prev);
      if (next.has(repoName)) {
        next.delete(repoName);
      } else {
        next.add(repoName);
      }
      return next;
    });
  };

  const handleShowAllInSidebar = () => {
    setTempVisibleRepos(new Set(indexedRepos.map((r) => r.name)));
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
    if (list.length > 0) {
      onBuildSelected(list);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (!isIndexing) onClose();
      }}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Manage Repositories</h2>
          <button
            type="button"
            className="btn-close"
            onClick={onClose}
            disabled={isIndexing}
          >
            &times;
          </button>
        </div>

        <div className="modal-body">
          {/* Workspace root config */}
          <div className="config-group">
            <label className="config-label">Workspace Root Path</label>
            <div className="config-input-row">
              <input
                type="text"
                className="config-input"
                value={tempWorkspaceRoot}
                onChange={(e) => setTempWorkspaceRoot(e.target.value)}
                disabled={isIndexing}
              />
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveConfig}
                disabled={
                  isIndexing || tempWorkspaceRoot === workspaceRoot
                }
              >
                Save
              </button>
            </div>
            <span className="config-hint">
              Repositories under this directory can be indexed and added to the
              sidebar.
            </span>
          </div>

          {/* Sidebar repo picker */}
          <div className="sidebar-config-section">
            <div className="section-header-row">
              <h3 className="section-title">Sidebar Repositories</h3>
              <div className="batch-actions-row">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={handleShowAllInSidebar}
                  disabled={isIndexing}
                >
                  Show All Indexed
                </button>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={handleSaveVisibleRepos}
                  disabled={isIndexing}
                >
                  Save Sidebar ({tempVisibleRepos.size})
                </button>
              </div>
            </div>
            <p className="config-hint sidebar-config-hint">
              Choose which indexed repositories appear in the left pane.
              Unselected repos stay hidden even if indexed.
            </p>
            {indexedRepos.length === 0 ? (
              <p className="no-repos-msg">
                Index at least one repository to add it to the sidebar.
              </p>
            ) : (
              <ul className="sidebar-picker-list">
                {indexedRepos.map((repo) => (
                  <li key={repo.name} className="sidebar-picker-item">
                    <label className="checkbox-label-all">
                      <input
                        type="checkbox"
                        checked={tempVisibleRepos.has(repo.name)}
                        onChange={() => handleToggleSidebarRepo(repo.name)}
                        disabled={isIndexing}
                      />
                      <span>{repo.name}</span>
                      <span className="repo-meta-status">
                        {repo.nodeCount.toLocaleString()} nodes ·{" "}
                        {repo.edgeCount.toLocaleString()} edges
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Active job status */}
          {activeJob && (
            <div className={`job-panel job-panel--${activeJob.status}`}>
              <div className="job-header">
                <strong>Indexing: {activeJob.repo}</strong>
                <span className="job-status-text">
                  {activeJob.status === "running"
                    ? "Running..."
                    : activeJob.status === "success"
                      ? "Completed"
                      : "Failed"}
                </span>
              </div>
              {activeJob.error && (
                <pre className="job-error-log">{activeJob.error}</pre>
              )}
              {activeJob.status !== "running" && (
                <button
                  type="button"
                  className="btn-secondary btn-sm mt-2"
                  onClick={onClearJob}
                >
                  Dismiss status
                </button>
              )}
            </div>
          )}

          {/* Batch indexing queue */}
          {indexingQueue.length > 0 && (
            <div className="queue-status-panel">
              <span className="queue-status-text">
                Queue active: indexing <strong>{indexingQueue[0]}</strong> (
                {indexingQueue.length} folders remaining)
              </span>
              <button
                type="button"
                className="btn-danger btn-sm"
                onClick={onCancelQueue}
              >
                Cancel Queue
              </button>
            </div>
          )}

          {/* Detected folders list */}
          <div className="detected-repos-section">
            <div className="section-header-row">
              <h3 className="section-title">
                Detected Folders ({repos.length})
              </h3>
              <div className="batch-actions-row">
                <label className="checkbox-label-all">
                  <input
                    type="checkbox"
                    checked={
                      repos.length > 0 &&
                      selectedFolders.size === repos.length
                    }
                    onChange={handleSelectAll}
                    disabled={isIndexing || indexingQueue.length > 0}
                  />
                  <span>Select All</span>
                </label>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={handleBuildSelected}
                  disabled={
                    selectedFolders.size === 0 ||
                    isIndexing ||
                    indexingQueue.length > 0
                  }
                >
                  Build Selected ({selectedFolders.size})
                </button>
              </div>
            </div>
            <ul className="detected-repos-list">
              {repos.map((repo) => {
                const isIndexingCurrent =
                  activeJob?.repo === repo.name &&
                  activeJob.status === "running";
                const isChecked = selectedFolders.has(repo.name);
                const isQueued = indexingQueue.includes(repo.name);
                return (
                  <li
                    key={repo.name}
                    className={`detected-repo-item ${isQueued ? "queued" : ""}`}
                  >
                    <div className="repo-checkbox-and-meta">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleFolder(repo.name)}
                        disabled={
                          isIndexing || indexingQueue.length > 0
                        }
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
                              Indexed ({repo.nodeCount} nodes ·{" "}
                              {repo.edgeCount} edges)
                            </span>
                          ) : (
                            <span className="badge badge--not-indexed">
                              Not Indexed
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => onReindex(repo.name)}
                      disabled={
                        isIndexing || indexingQueue.length > 0
                      }
                    >
                      {isIndexingCurrent
                        ? "Indexing..."
                        : isQueued
                          ? "Queued"
                          : repo.hasGraph
                            ? "Rebuild Index"
                            : "Build Index"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
