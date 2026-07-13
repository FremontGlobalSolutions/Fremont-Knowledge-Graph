/**
 * Vite dev-server API plugin — serves graph data, manages config, and
 * triggers Graphify reindexing from the viewer UI.
 *
 * Security: all repo-name inputs are validated to prevent path-traversal
 * and command-injection vectors. Resolved paths are checked to stay within
 * the configured workspace root.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import type { ViewerConfig, RepoInfo } from "../types.js";

// ── Config file I/O ────────────────────────────────────────────────

const CONFIG_FILE = path.join(process.cwd(), ".viewer-config.json");

function readViewerConfig(): ViewerConfig {
  const defaults: ViewerConfig = {
    workspaceRoot: path.resolve(path.join(process.cwd(), "..")),
    visibleRepos: [],
  };
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
      return {
        workspaceRoot: data.workspaceRoot || defaults.workspaceRoot,
        visibleRepos: Array.isArray(data.visibleRepos)
          ? data.visibleRepos.filter(
              (name: unknown) => typeof name === "string" && name.length > 0
            )
          : defaults.visibleRepos,
      };
    }
  } catch {
    /* ignore parse errors — fall through to defaults */
  }
  return defaults;
}

function writeViewerConfig(partial: Partial<ViewerConfig>): ViewerConfig {
  const current = readViewerConfig();
  const next: ViewerConfig = {
    workspaceRoot: partial.workspaceRoot ?? current.workspaceRoot,
    visibleRepos: partial.visibleRepos ?? current.visibleRepos,
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

// ── Input validation ───────────────────────────────────────────────

/** Validates a repo name is a single directory segment with no traversal. */
function isValidRepoName(name: string): boolean {
  if (!name || typeof name !== "string") return false;
  // Must not contain path separators or traversal sequences
  if (/[/\\]/.test(name)) return false;
  if (name === "." || name === "..") return false;
  // Must not be excessively long
  if (name.length > 255) return false;
  return true;
}

/** Resolves a repo path and verifies it stays within the workspace root. */
function resolveContainedPath(
  workspaceRoot: string,
  repoName: string
): string | null {
  const resolved = path.resolve(workspaceRoot, repoName);
  const normalizedRoot = path.resolve(workspaceRoot) + path.sep;
  if (!resolved.startsWith(normalizedRoot) && resolved !== path.resolve(workspaceRoot)) {
    return null;
  }
  return resolved;
}

// ── Repo discovery ─────────────────────────────────────────────────

function listRepos(workspaceRoot: string): RepoInfo[] {
  const repos: RepoInfo[] = [];
  try {
    if (!fs.existsSync(workspaceRoot)) return [];
    const entries = fs.readdirSync(workspaceRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (
        entry.name.startsWith(".") ||
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === "bin"
      )
        continue;

      const repoPath = path.join(workspaceRoot, entry.name);
      const isGit = fs.existsSync(path.join(repoPath, ".git"));
      const graphPath = path.join(repoPath, "graphify-out", "graph.json");
      const hasGraph = fs.existsSync(graphPath);

      let nodeCount = 0;
      let edgeCount = 0;
      let indexedAt: string | null = null;

      if (hasGraph) {
        try {
          const stats = fs.statSync(graphPath);
          indexedAt = stats.mtime.toISOString();
          const raw = fs.readFileSync(graphPath, "utf8");
          const graphData = JSON.parse(raw);
          const nodes = graphData.nodes || [];
          const edges = graphData.edges || graphData.links || [];
          nodeCount = nodes.length;
          edgeCount = edges.length;

          if (graphData.metadata) {
            if (typeof graphData.metadata.nodeCount === "number") {
              nodeCount = graphData.metadata.nodeCount;
            }
            if (typeof graphData.metadata.edgeCount === "number") {
              edgeCount = graphData.metadata.edgeCount;
            }
          }
        } catch {
          /* corrupt graph.json — show as indexed but 0 counts */
        }
      }

      repos.push({
        name: entry.name,
        path: repoPath,
        hasGraph,
        isGit,
        nodeCount,
        edgeCount,
        indexedAt,
      });
    }
  } catch (e) {
    console.error("Failed to read workspace:", e);
  }
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Request body parser ────────────────────────────────────────────

function getRequestBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body) as Record<string, unknown>);
      } catch {
        resolve({});
      }
    });
  });
}

// ── Indexing process state ─────────────────────────────────────────

interface IndexingProcess {
  repo: string;
  status: "running" | "success" | "error";
  startTime: string;
  endTime?: string;
  error?: string;
}

let activeIndexingProcess: IndexingProcess | null = null;

// ── Plugin entry point ─────────────────────────────────────────────

export function apiPlugin(): Plugin {
  return {
    name: "knowledge-graph-api",
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const urlObj = new URL(
          req.url || "",
          `http://${req.headers.host || "localhost"}`
        );
        const pathname = urlObj.pathname;

        if (!pathname.startsWith("/api/")) {
          next();
          return;
        }

        res.setHeader("Content-Type", "application/json");

        // ── GET/POST /api/config ────────────────────────────────
        if (pathname === "/api/config") {
          if (req.method === "GET") {
            const config = readViewerConfig();
            res.end(JSON.stringify(config));
            return;
          }
          if (req.method === "POST") {
            const body = await getRequestBody(req);
            const partial: Partial<ViewerConfig> = {};
            if (
              typeof body.workspaceRoot === "string" &&
              (body.workspaceRoot as string).trim()
            ) {
              partial.workspaceRoot = (body.workspaceRoot as string).trim();
            }
            if (body.visibleRepos !== undefined) {
              if (!Array.isArray(body.visibleRepos)) {
                res.statusCode = 400;
                res.end(
                  JSON.stringify({ error: "visibleRepos must be an array" })
                );
                return;
              }
              partial.visibleRepos = (body.visibleRepos as unknown[]).filter(
                (name: unknown) => typeof name === "string" && name.length > 0
              ) as string[];
            }
            if (Object.keys(partial).length === 0) {
              res.statusCode = 400;
              res.end(
                JSON.stringify({ error: "No config fields to update" })
              );
              return;
            }
            const config = writeViewerConfig(partial);
            res.end(JSON.stringify({ success: true, ...config }));
            return;
          }
        }

        // ── GET /api/repos ──────────────────────────────────────
        if (pathname === "/api/repos" && req.method === "GET") {
          const root = readViewerConfig().workspaceRoot;
          const repos = listRepos(root);
          res.end(JSON.stringify({ repos }));
          return;
        }

        // ── GET /api/graph?repo=<name> ──────────────────────────
        if (pathname === "/api/graph" && req.method === "GET") {
          const repoName = urlObj.searchParams.get("repo");
          if (!repoName) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Missing repo parameter" }));
            return;
          }
          if (!isValidRepoName(repoName)) {
            res.statusCode = 400;
            res.end(
              JSON.stringify({ error: "Invalid repo name" })
            );
            return;
          }
          const root = readViewerConfig().workspaceRoot;
          const repoDir = resolveContainedPath(root, repoName);
          if (!repoDir) {
            res.statusCode = 403;
            res.end(
              JSON.stringify({ error: "Repo path escapes workspace root" })
            );
            return;
          }
          const graphPath = path.join(repoDir, "graphify-out", "graph.json");
          if (fs.existsSync(graphPath)) {
            try {
              const content = fs.readFileSync(graphPath, "utf8");
              res.end(content);
            } catch (e: unknown) {
              const message =
                e instanceof Error ? e.message : "Unknown error";
              res.statusCode = 500;
              res.end(
                JSON.stringify({ error: `Failed to read graph: ${message}` })
              );
            }
          } else {
            res.statusCode = 404;
            res.end(
              JSON.stringify({ error: `Graph not found for ${repoName}` })
            );
          }
          return;
        }

        // ── POST /api/reindex ───────────────────────────────────
        if (pathname === "/api/reindex" && req.method === "POST") {
          const body = await getRequestBody(req);
          const repoName =
            typeof body.repo === "string" ? body.repo : "";
          if (!repoName) {
            res.statusCode = 400;
            res.end(
              JSON.stringify({ error: "Missing repo parameter in body" })
            );
            return;
          }
          if (!isValidRepoName(repoName)) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Invalid repo name" }));
            return;
          }

          if (
            activeIndexingProcess &&
            activeIndexingProcess.status === "running"
          ) {
            res.statusCode = 409;
            res.end(
              JSON.stringify({
                error: `An indexing process is already running for ${activeIndexingProcess.repo}`,
              })
            );
            return;
          }

          const root = readViewerConfig().workspaceRoot;
          const repoPath = resolveContainedPath(root, repoName);
          if (!repoPath) {
            res.statusCode = 403;
            res.end(
              JSON.stringify({ error: "Repo path escapes workspace root" })
            );
            return;
          }

          activeIndexingProcess = {
            repo: repoName,
            status: "running",
            startTime: new Date().toISOString(),
          };

          const scriptPath = path.join(
            process.cwd(),
            "scripts",
            "update-graphify-graphs.ps1"
          );
          const psArgs = [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            scriptPath,
            "-Workspace",
            root,
            "-Repo",
            repoPath,
          ];

          if (body.force) {
            psArgs.push("-Force");
          }

          console.log(
            `[Reindex] Spawning powershell.exe for ${repoName} in ${root}`
          );
          const child = spawn("powershell.exe", psArgs, {
            cwd: process.cwd(),
          });

          let output = "";
          child.stdout.on("data", (data: Buffer) => {
            output += data.toString();
          });
          child.stderr.on("data", (data: Buffer) => {
            output += data.toString();
          });

          child.on("close", (code: number | null) => {
            console.log(
              `[Reindex] PowerShell exited with code ${code} for ${repoName}`
            );
            if (code === 0) {
              activeIndexingProcess!.status = "success";
              activeIndexingProcess!.endTime = new Date().toISOString();
            } else {
              activeIndexingProcess!.status = "error";
              activeIndexingProcess!.endTime = new Date().toISOString();
              activeIndexingProcess!.error =
                output || `Exited with code ${code}`;
            }
          });

          res.end(
            JSON.stringify({
              success: true,
              message: `Indexing started for ${repoName}`,
            })
          );
          return;
        }

        // ── GET/POST /api/reindex/status ────────────────────────
        if (pathname === "/api/reindex/status") {
          if (req.method === "GET") {
            res.end(
              JSON.stringify(activeIndexingProcess || { status: "idle" })
            );
            return;
          }
          if (req.method === "POST") {
            activeIndexingProcess = null;
            res.end(JSON.stringify({ success: true }));
            return;
          }
        }

        res.statusCode = 404;
        res.end(JSON.stringify({ error: "API Route not found" }));
      });
    },
  };
}
