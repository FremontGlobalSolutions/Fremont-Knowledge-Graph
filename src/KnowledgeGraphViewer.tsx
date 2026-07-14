import { useCallback, useState } from "react";
import { GraphCanvas } from "./GraphCanvas";
import { NodeInspector } from "./NodeInspector";
import { FullscreenCanvasFrame } from "./FullscreenCanvasFrame";
import type { GraphRenderMode, KnowledgeGraphJson, KnowledgeGraphNode } from "./types";

export type KnowledgeGraphViewerProps = {
  graph: KnowledgeGraphJson;
  isDark: boolean;
  initialMode?: GraphRenderMode;
  onSelectNode?: (node: KnowledgeGraphNode | null) => void;
  selectedNodeId?: string | null;
  title?: string;
};

export function KnowledgeGraphViewer({
  graph,
  isDark,
  initialMode = "2d",
  onSelectNode,
  selectedNodeId: controlledSelectedNodeId,
  title = "Knowledge Graph",
}: KnowledgeGraphViewerProps) {
  const [mode, setMode] = useState<GraphRenderMode>(initialMode);
  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [internalSelectedNode, setInternalSelectedNode] = useState<KnowledgeGraphNode | null>(null);

  const selectedNode = controlledSelectedNodeId
    ? graph.nodes.find((n) => n.id === controlledSelectedNodeId) || null
    : internalSelectedNode;

  const handleSelectNode = useCallback(
    (node: KnowledgeGraphNode | null) => {
      if (onSelectNode) {
        onSelectNode(node);
      } else {
        setInternalSelectedNode(node);
      }
    },
    [onSelectNode]
  );

  const handleSelectNeighbor = useCallback(
    (nodeId: string) => {
      const neighbor = graph.nodes.find((n) => n.id === nodeId) || null;
      handleSelectNode(neighbor);
    },
    [graph.nodes, handleSelectNode]
  );

  const hiddenRepos = new Set<string>();
  const repos = Array.from(new Set(graph.nodes.map((n) => n.repo).filter(Boolean))) as string[];

  return (
    <div className="main-layout" style={{ width: "100%", height: "100%", display: "flex", gap: "0.75rem" }}>
      {selectedNode && (
        <aside className="sidebar" style={{ width: "280px", flexShrink: 0, overflowY: "auto" }}>
          <NodeInspector
            node={selectedNode}
            graph={graph}
            onSelectNeighbor={handleSelectNeighbor}
          />
        </aside>
      )}

      <main className="graph-panel" style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <FullscreenCanvasFrame
          title={title}
          isDark={isDark}
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
            repos={repos}
            selectedNodeId={selectedNode?.id ?? null}
            mode={mode}
            isDark={isDark}
            onSelectNode={handleSelectNode}
          />
        </FullscreenCanvasFrame>
      </main>
    </div>
  );
}
