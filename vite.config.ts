import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const CONFIG_FILE = path.join(process.cwd(), ".viewer-config.json");

function getWorkspaceRoot(): string {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
      if (data.workspaceRoot) return data.workspaceRoot;
    }
  } catch {}
  return path.resolve(path.join(process.cwd(), ".."));
}

function saveWorkspaceRoot(rootPath: string): void {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ workspaceRoot: rootPath }, null, 2), "utf8");
}

interface RepoInfo {
  name: string;
  path: string;
  hasGraph: boolean;
  isGit: boolean;
  nodeCount: number;
  edgeCount: number;
  indexedAt: string | null;
}

function listRepos(workspaceRoot: string): RepoInfo[] {
  const repos: RepoInfo[] = [];
  try {
    if (!fs.existsSync(workspaceRoot)) return [];
    const entries = fs.readdirSync(workspaceRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist" || entry.name === "bin") continue;
      const repoPath = path.join(workspaceRoot, entry.name);
      const gitPath = path.join(repoPath, ".git");
      const isGit = fs.existsSync(gitPath);

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
        } catch {}
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

function getRequestBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk: any) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

interface IndexingProcess {
  repo: string;
  status: "running" | "success" | "error";
  startTime: string;
  endTime?: string;
  error?: string;
}

let activeIndexingProcess: IndexingProcess | null = null;

function apiPlugin() {
  return {
    name: "api-plugin",
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const urlObj = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
        const pathname = urlObj.pathname;

        if (pathname.startsWith("/api/")) {
          res.setHeader("Content-Type", "application/json");

          if (pathname === "/api/config") {
            if (req.method === "GET") {
              const root = getWorkspaceRoot();
              res.end(JSON.stringify({ workspaceRoot: root }));
              return;
            }
            if (req.method === "POST") {
              const body = await getRequestBody(req);
              if (body.workspaceRoot) {
                saveWorkspaceRoot(body.workspaceRoot);
                res.end(JSON.stringify({ success: true, workspaceRoot: body.workspaceRoot }));
              } else {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: "Missing workspaceRoot parameter" }));
              }
              return;
            }
          }

          if (pathname === "/api/repos") {
            if (req.method === "GET") {
              const root = getWorkspaceRoot();
              const repos = listRepos(root);
              res.end(JSON.stringify({ repos }));
              return;
            }
          }

          if (pathname === "/api/graph") {
            if (req.method === "GET") {
              const repoName = urlObj.searchParams.get("repo");
              if (!repoName) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: "Missing repo parameter" }));
                return;
              }
              const root = getWorkspaceRoot();
              const graphPath = path.join(root, repoName, "graphify-out", "graph.json");
              if (fs.existsSync(graphPath)) {
                try {
                  const content = fs.readFileSync(graphPath, "utf8");
                  res.end(content);
                } catch (e: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: `Failed to read graph: ${e.message}` }));
                }
              } else {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: `Graph not found at ${graphPath}` }));
              }
              return;
            }
          }

          if (pathname === "/api/reindex") {
            if (req.method === "POST") {
              const body = await getRequestBody(req);
              const repoName = body.repo;
              if (!repoName) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: "Missing repo parameter in body" }));
                return;
              }

              if (activeIndexingProcess && activeIndexingProcess.status === "running") {
                res.statusCode = 409;
                res.end(
                  JSON.stringify({
                    error: `An indexing process is already running for ${activeIndexingProcess.repo}`,
                  })
                );
                return;
              }

              const root = getWorkspaceRoot();
              const repoPath = path.join(root, repoName);

              activeIndexingProcess = {
                repo: repoName,
                status: "running",
                startTime: new Date().toISOString(),
              };

              const scriptPath = path.join(process.cwd(), "scripts", "update-graphify-graphs.ps1");
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

              console.log(`[Reindex] Spawning powershell.exe for ${repoName} in ${root}`);
              const child = spawn("powershell.exe", psArgs, {
                cwd: process.cwd(),
              });

              let output = "";
              child.stdout.on("data", (data) => {
                output += data.toString();
              });
              child.stderr.on("data", (data) => {
                output += data.toString();
              });

              child.on("close", (code) => {
                console.log(`[Reindex] PowerShell exited with code ${code} for ${repoName}`);
                if (code === 0) {
                  activeIndexingProcess!.status = "success";
                  activeIndexingProcess!.endTime = new Date().toISOString();
                } else {
                  activeIndexingProcess!.status = "error";
                  activeIndexingProcess!.endTime = new Date().toISOString();
                  activeIndexingProcess!.error = output || `Exited with code ${code}`;
                }
              });

              res.end(JSON.stringify({ success: true, message: `Indexing started for ${repoName}` }));
              return;
            }
          }

          if (pathname === "/api/reindex/status") {
            if (req.method === "GET") {
              res.end(JSON.stringify(activeIndexingProcess || { status: "idle" }));
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
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiPlugin()],
  server: {
    port: 5199,
    open: true,
  },
});
