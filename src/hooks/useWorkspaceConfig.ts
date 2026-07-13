import { useCallback, useEffect, useState } from "react";
import type { ViewerConfig } from "../types";

/**
 * Manages workspace root and visible-repos configuration via the API.
 */
export function useWorkspaceConfig() {
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [visibleRepos, setVisibleRepos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      if (res.ok) {
        const data: ViewerConfig = await res.json();
        setWorkspaceRoot(data.workspaceRoot ?? "");
        setVisibleRepos(Array.isArray(data.visibleRepos) ? data.visibleRepos : []);
      }
    } catch (e) {
      console.error("Failed to fetch config:", e);
    }
  }, []);

  const saveWorkspaceRoot = useCallback(async (newRoot: string) => {
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceRoot: newRoot }),
      });
      if (res.ok) {
        const data = await res.json();
        setWorkspaceRoot(data.workspaceRoot);
        return true;
      }
    } catch {
      /* handled by caller */
    }
    return false;
  }, []);

  const saveVisibleRepos = useCallback(async (repos: string[]) => {
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibleRepos: repos.sort() }),
      });
      if (res.ok) {
        const data = await res.json();
        setVisibleRepos(Array.isArray(data.visibleRepos) ? data.visibleRepos : []);
        return true;
      }
    } catch {
      /* handled by caller */
    }
    return false;
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await fetchConfig();
      setLoading(false);
    })();
  }, [fetchConfig]);

  return {
    workspaceRoot,
    visibleRepos,
    loading,
    fetchConfig,
    saveWorkspaceRoot,
    saveVisibleRepos,
  };
}
