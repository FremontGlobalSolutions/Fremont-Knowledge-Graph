/**
 * Web Worker that parses raw graph JSON off the main thread.
 * Prevents multi-MB JSON.parse from blocking the UI.
 */
import { normalizeGraphifyJson } from "../normalize-graphify";

self.onmessage = (event: MessageEvent<{ text: string; repoName: string }>) => {
  const { text, repoName } = event.data;
  try {
    const parsed = normalizeGraphifyJson(JSON.parse(text));
    // Tag nodes with repo if missing
    parsed.nodes = parsed.nodes.map((node) => ({
      ...node,
      repo: node.repo || repoName,
    }));
    self.postMessage({ type: "success", data: parsed });
  } catch (e) {
    self.postMessage({
      type: "error",
      error: e instanceof Error ? e.message : "Failed to parse graph",
    });
  }
};
