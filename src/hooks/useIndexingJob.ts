import { useCallback, useEffect, useState } from "react";
import type { IndexingJob } from "../types";

/**
 * Manages indexing job lifecycle: triggering, polling, batch queuing.
 */
export function useIndexingJob(onJobComplete?: (repoName: string) => void) {
  const [activeJob, setActiveJob] = useState<IndexingJob | null>(null);
  const [indexingQueue, setIndexingQueue] = useState<string[]>([]);

  // Poll job status when an indexing process is running
  useEffect(() => {
    if (!activeJob || activeJob.status !== "running") return;

    const checkStatus = async () => {
      try {
        const res = await fetch("/api/reindex/status");
        if (!res.ok) return;
        const data: IndexingJob = await res.json();
        if (data.status === "running") {
          setActiveJob(data);
        } else if (data.status === "success" || data.status === "error") {
          setActiveJob(data);
          if (data.status === "success") {
            onJobComplete?.(data.repo);
          }
        } else {
          setActiveJob(null);
        }
      } catch (e) {
        console.error("Error fetching job status:", e);
      }
    };

    const intervalId = setInterval(checkStatus, 2000);
    return () => clearInterval(intervalId);
  }, [activeJob?.status, onJobComplete]);

  // Process batch queue
  useEffect(() => {
    if (indexingQueue.length === 0) return;
    if (activeJob && activeJob.status === "running") return;

    if (activeJob && (activeJob.status === "success" || activeJob.status === "error")) {
      // Shift to next in queue
      setIndexingQueue((prev) => prev.slice(1));
      void clearJob();
    } else if (!activeJob) {
      // Start next item
      const nextFolder = indexingQueue[0];
      if (nextFolder) {
        void startReindex(nextFolder);
      }
    }
  }, [indexingQueue, activeJob]);

  const startReindex = useCallback(async (repoName: string, force = false) => {
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
        console.error(errData.error || "Failed to start indexing");
      }
    } catch (err) {
      console.error("Error starting indexing:", err);
    }
  }, []);

  const clearJob = useCallback(async () => {
    try {
      await fetch("/api/reindex/status", { method: "POST" });
      setActiveJob(null);
    } catch {
      /* ignore */
    }
  }, []);

  const startBatchReindex = useCallback((repos: string[]) => {
    if (repos.length === 0) return;
    setIndexingQueue(repos);
  }, []);

  const cancelQueue = useCallback(() => {
    setIndexingQueue([]);
  }, []);

  // Check for existing running job on startup
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/reindex/status");
        if (res.ok) {
          const data: IndexingJob = await res.json();
          if (data.status === "running") {
            setActiveJob(data);
          }
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  return {
    activeJob,
    indexingQueue,
    isIndexing: activeJob?.status === "running",
    startReindex,
    clearJob,
    startBatchReindex,
    cancelQueue,
  };
}
