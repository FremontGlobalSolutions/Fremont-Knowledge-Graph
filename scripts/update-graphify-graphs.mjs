import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to run a command and return a Promise
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`[Reindex] Running: ${command} ${args.join(" ")}`);
    const child = spawn(command, args, { stdio: "inherit", shell: true, ...options });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command '${command}' exited with code ${code}`));
      }
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

// Main execution function
async function main() {
  const args = process.argv.slice(2);
  let repoPath = args[0];
  const force = args.includes("--force");

  if (!repoPath) {
    console.error("Usage: node update-graphify-graphs.mjs <repo-path> [--force]");
    process.exit(1);
  }

  repoPath = path.resolve(repoPath);

  // Validate it's a directory
  if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
    console.error(`Error: Repo path does not exist or is not a directory: ${repoPath}`);
    process.exit(1);
  }

  console.log(`[Reindex] Indexing repository: ${repoPath}`);

  // 1. If force, clean existing graphify-out
  if (force) {
    const outPath = path.join(repoPath, "graphify-out");
    if (fs.existsSync(outPath)) {
      console.log(`[Reindex] Cleaning existing output directory: ${outPath}`);
      fs.rmSync(outPath, { recursive: true, force: true });
    }
  }

  // 2. Run graphify update
  try {
    // Attempt global graphify command first
    await runCommand("graphify", ["update", repoPath]);
  } catch (globalErr) {
    console.log("[Reindex] global 'graphify' failed or not found, attempting via npx...");
    try {
      await runCommand("npx", ["-y", "@sentropic/graphify", "update", repoPath]);
    } catch (npxErr) {
      console.warn("[Reindex] Graphify CLI failed or was not found. Proceeding with folder scanning only.");
    }
  }

  // 3. Run post-processing
  try {
    const postProcessScript = path.join(__dirname, "post-process-graph.mjs");
    await runCommand("node", [postProcessScript, repoPath]);
    console.log("[Reindex] Indexing completed successfully!");
  } catch (postErr) {
    console.error(`[Reindex] Failed to run post-processing on graph: ${postErr.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[Reindex] Unexpected error: ${err.message}`);
  process.exit(1);
});
