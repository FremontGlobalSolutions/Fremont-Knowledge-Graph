import fs from "node:fs";
import path from "node:path";

const repoPath = process.argv[2];
if (!repoPath) {
  console.error("Missing repo path argument");
  process.exit(1);
}

const absoluteRepoPath = path.resolve(repoPath);
const repoName = path.basename(absoluteRepoPath);
const outDir = path.join(absoluteRepoPath, "graphify-out");
const graphPath = path.join(outDir, "graph.json");

console.log(`[post-process] Processing directory structure for: ${repoName}`);

// 1. Read existing graph or initialize a new one
let graph = { nodes: [], edges: [] };
if (fs.existsSync(graphPath)) {
  try {
    graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
    if (!graph.nodes) graph.nodes = [];
    if (!graph.edges) graph.edges = [];
  } catch (e) {
    console.error(`[post-process] Failed to parse existing graph.json, initializing empty:`, e);
  }
}

// Ensure outDir exists
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 2. Helper to construct stable node IDs matching Graphify format
function makeId(...parts) {
  const combined = parts.filter(Boolean).join("_");
  return combined
    .replace(/\\/g, "/")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

// 3. Scan directory recursively
const ignoreList = new Set([
  ".git",
  "node_modules",
  "dist",
  "bin",
  "graphify-out",
  ".idea",
  ".vscode",
  ".gemini",
  "build",
]);

const files = [];
const dirs = [];

function scanDir(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (ignoreList.has(entry.name) || entry.name.startsWith(".")) continue;

    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(absoluteRepoPath, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      dirs.push({ name: entry.name, relPath, fullPath });
      scanDir(fullPath);
    } else {
      files.push({ name: entry.name, relPath, fullPath });
    }
  }
}

scanDir(absoluteRepoPath);

// Create lookup maps for existing nodes/edges
const existingNodes = new Map(graph.nodes.map((n) => [n.id, n]));
const existingEdges = new Set(graph.edges.map((e) => `${e.source}->${e.target}`));

// 4. Add directory nodes & directory structure contains edges
// Root directory node
const rootNid = makeId(repoName);
if (!existingNodes.has(rootNid)) {
  graph.nodes.push({
    id: rootNid,
    label: repoName,
    type: "directory",
    path: "",
    repo: repoName,
  });
}

for (const dir of dirs) {
  const nid = makeId(repoName, dir.relPath);
  if (!existingNodes.has(nid)) {
    graph.nodes.push({
      id: nid,
      label: dir.name,
      type: "directory",
      path: dir.relPath,
      repo: repoName,
    });
  }

  // Link to parent directory
  const parentDir = path.dirname(dir.relPath);
  const parentNid = parentDir === "." ? rootNid : makeId(repoName, parentDir);
  const edgeKey = `${parentNid}->${nid}`;
  if (!existingEdges.has(edgeKey)) {
    existingEdges.add(edgeKey);
    graph.edges.push({
      source: parentNid,
      target: nid,
      type: "contains",
      label: "contains",
    });
  }
}

// 5. Add file nodes and link to their directories
for (const file of files) {
  const nid = makeId(repoName, file.relPath);

  if (existingNodes.has(nid)) {
    // If AST indexing already created a file node, ensure it has type "file"
    const node = existingNodes.get(nid);
    if (!node.type) node.type = "file";
    node.path = file.relPath;
    node.repo = repoName;
  } else {
    // Determine if it is a document file (e.g. md, txt, pdf, html, etc.)
    const ext = path.extname(file.name).toLowerCase();
    const isDoc = [
      ".md",
      ".txt",
      ".pdf",
      ".docx",
      ".csv",
      ".xlsx",
      ".json",
      ".yml",
      ".yaml",
      ".html",
      ".htm",
    ].includes(ext);

    graph.nodes.push({
      id: nid,
      label: file.name,
      type: "file",
      file_type: isDoc ? "doc" : "code",
      path: file.relPath,
      source_file: file.relPath,
      repo: repoName,
    });
  }

  // Link file to parent directory
  const parentDir = path.dirname(file.relPath);
  const parentNid = parentDir === "." ? rootNid : makeId(repoName, parentDir);
  const edgeKey = `${parentNid}->${nid}`;
  if (!existingEdges.has(edgeKey)) {
    existingEdges.add(edgeKey);
    graph.edges.push({
      source: parentNid,
      target: nid,
      type: "contains",
      label: "contains",
    });
  }
}

// Save updated graph back to graphify-out/graph.json
fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), "utf8");
console.log(
  `[post-process] Completed. Total nodes: ${graph.nodes.length}, Total edges: ${graph.edges.length}`
);
