import type { Object3D } from "three";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import ForceGraph2D from "react-force-graph-2d";
import ForceGraph3D from "react-force-graph-3d";
import { useDebouncedValue } from "./useDebouncedValue";
import {
  buildForceGraphData,
  buildVisibleNodeIdSet,
  computeForceLayoutTuning,
  isForceGraphLinkVisible,
  linkEndpointId,
  type ForceGraphLink,
  type ForceGraphNode,
  type KnowledgeGraphFilterOptions,
} from "./graph-data";
import { readGraphTheme, repoColor, type GraphTheme } from "./graph-theme";
import { createNodeLabelSprite } from "./graph-3d-label";
import type { GraphRenderMode, KnowledgeGraphJson, KnowledgeGraphNode } from "./types";

type Props = {
  graph: KnowledgeGraphJson;
  search: string;
  folderFilter: string;
  hiddenRepos: Set<string>;
  repos: string[];
  selectedNodeId: string | null;
  mode: GraphRenderMode;
  isDark: boolean;
  onSelectNode: (node: KnowledgeGraphNode | null) => void;
};

type RuntimeGraphNode = {
  id?: string | number;
  label?: string;
  type?: string;
  file?: string;
  repo?: string;
  x?: number;
  y?: number;
  z?: number;
};

type RuntimeGraphLink = {
  source?: string | number | { id?: string | number };
  target?: string | number | { id?: string | number };
};

function asForceGraphNode(node: RuntimeGraphNode): ForceGraphNode {
  return {
    id: String(node.id ?? ""),
    label: node.label ?? String(node.id ?? ""),
    type: node.type ?? "node",
    file: node.file ?? "",
    repo: node.repo,
  };
}

type ForceGraph2DRef = {
  d3Force: (name: string, force?: unknown) => unknown;
  centerAt: (x?: number, y?: number, durationMs?: number) => void;
  zoom: (level?: number, durationMs?: number) => void;
  zoomToFit: (durationMs?: number, padding?: number) => void;
  pauseAnimation?: () => void;
};

type ForceGraph3DRef = {
  d3Force: (name: string, force?: unknown) => unknown;
  cameraPosition: (
    position: { x?: number; y?: number; z?: number },
    lookAt?: { x?: number; y?: number; z?: number },
    transitionMs?: number
  ) => void;
  zoomToFit: (durationMs?: number, padding?: number) => void;
  pauseAnimation?: () => void;
};

function focusGraphOnNode(
  mode: GraphRenderMode,
  fg2d: ForceGraph2DRef | null,
  fg3d: ForceGraph3DRef | null,
  node: RuntimeGraphNode
): void {
  if (typeof node.x !== "number" || typeof node.y !== "number") return;

  if (mode === "2d") {
    if (typeof fg2d?.centerAt === "function") {
      fg2d.centerAt(node.x, node.y, 500);
      if (typeof fg2d.zoom === "function") {
        fg2d.zoom(1.8, 500);
      }
    }
    return;
  }

  if (typeof fg3d?.cameraPosition === "function") {
    const z = typeof node.z === "number" ? node.z : 0;
    fg3d.cameraPosition(
      { x: node.x, y: node.y, z: z + 140 },
      { x: node.x, y: node.y, z },
      500
    );
  }
}

function fitGraphToView(
  mode: GraphRenderMode,
  fg2d: ForceGraph2DRef | null,
  fg3d: ForceGraph3DRef | null
): void {
  const fg = mode === "3d" ? fg3d : fg2d;
  if (typeof fg?.zoomToFit === "function") {
    fg.zoomToFit(400, 36);
  }
  fg?.pauseAnimation?.();
}

function neighborNodeIds(
  graphData: { nodes: ForceGraphNode[]; links: ForceGraphLink[] },
  nodeId: string
): Set<string> {
  const neighbors = new Set<string>([nodeId]);
  for (const link of graphData.links) {
    const sourceId = linkEndpointId(link.source);
    const targetId = linkEndpointId(link.target);
    if (sourceId === nodeId) neighbors.add(targetId);
    if (targetId === nodeId) neighbors.add(sourceId);
  }
  return neighbors;
}

function resolveNodeColor(
  node: ForceGraphNode,
  theme: GraphTheme,
  visibleNodeIds: Set<string>,
  highlightIds: Set<string>,
  selectedId: string | null,
  repos: string[]
): string {
  if (!visibleNodeIds.has(node.id)) return theme.surfaceSecondary;
  if (node.id === selectedId) return theme.accentPrimary;
  if (highlightIds.has(node.id)) return theme.warning;
  if (node.type === "repository") return theme.accentPrimary;
  if (node.type === "package") return theme.crossRepo;
  if (node.type === "directory" || node.type === "folder") {
    return theme.textPrimary === "#f9fafb" ? "#ca8a04" : "#eab308";
  }
  if (node.repo) return repoColor(node.repo, repos);
  if (node.type === "file" || node.type === "code") return theme.fileNode;
  return theme.accentSecondary;
}

function isNodeVisible(node: RuntimeGraphNode, visibleNodeIds: Set<string>): boolean {
  return visibleNodeIds.has(String(node.id ?? ""));
}

function runtimeLinkEndpointId(
  endpoint: RuntimeGraphLink["source"] | RuntimeGraphLink["target"]
): string {
  if (endpoint == null) return "";
  if (typeof endpoint === "object") return String(endpoint.id ?? "");
  return String(endpoint);
}

export function GraphCanvas({
  graph,
  search,
  folderFilter,
  hiddenRepos,
  repos,
  selectedNodeId,
  mode,
  isDark,
  onSelectNode,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fg2dRef = useRef<ForceGraph2DRef | null>(null);
  const fg3dRef = useRef<ForceGraph3DRef | null>(null);
  const onSelectNodeRef = useRef(onSelectNode);
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);
  const initialFitDoneRef = useRef(false);
  const selectedNodeIdRef = useRef<string | null>(selectedNodeId);
  const [dimensions, setDimensions] = useState({ width: 800, height: 520 });
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const [labelSpritesReady, setLabelSpritesReady] = useState(mode !== "3d");
  const createLabelSpriteRef = useRef<((label: string, color: string) => Object3D | undefined) | null>(
    mode === "3d" ? createNodeLabelSprite : null
  );

  const theme = useMemo(() => readGraphTheme(isDark), [isDark]);
  const debouncedSearch = useDebouncedValue(search, 200);
  const debouncedFolderFilter = useDebouncedValue(folderFilter, 200);

  const filterOptions: KnowledgeGraphFilterOptions = useMemo(
    () => ({
      search: debouncedSearch,
      folderFilter: debouncedFolderFilter,
      hiddenRepos,
    }),
    [debouncedSearch, debouncedFolderFilter, hiddenRepos]
  );

  const graphData = useMemo(() => buildForceGraphData(graph), [graph]);
  const visibleNodeIds = useMemo(
    () => buildVisibleNodeIdSet(graph, filterOptions),
    [graph, filterOptions]
  );

  useEffect(() => {
    onSelectNodeRef.current = onSelectNode;
  }, [onSelectNode]);

  useEffect(() => {
    if (mode !== "3d") {
      createLabelSpriteRef.current = null;
      setLabelSpritesReady(false);
      return;
    }
    createLabelSpriteRef.current = createNodeLabelSprite;
    setLabelSpritesReady(true);
  }, [mode]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const width = Math.max(320, Math.floor(rect.width));
      const height = Math.max(320, Math.floor(rect.height));
      setDimensions((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height }
      );
    };

    updateSize();
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(el);
    return () => observer.disconnect();
  }, [mode]);

  useEffect(() => {
    const fg = mode === "3d" ? fg3dRef.current : fg2dRef.current;
    if (!fg) return;
    const tuning = computeForceLayoutTuning(graphData.nodes.length);
    const charge = fg.d3Force("charge") as { strength?: (value: number) => unknown } | undefined;
    const link = fg.d3Force("link") as { distance?: (value: number) => unknown } | undefined;
    charge?.strength?.(tuning.chargeStrength);
    link?.distance?.(tuning.linkDistance);
  }, [graphData, mode]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  useEffect(() => {
    initialFitDoneRef.current = false;
  }, [graphData, mode]);

  useEffect(() => {
    if (!selectedNodeId) {
      setHighlightIds(new Set());
      return;
    }
    setHighlightIds(neighborNodeIds(graphData, selectedNodeId));
    const node = graphData.nodes.find((n) => n.id === selectedNodeId) as
      | (ForceGraphNode & { x?: number; y?: number; z?: number })
      | undefined;
    if (node) {
      focusGraphOnNode(mode, fg2dRef.current, fg3dRef.current, node);
    }
  }, [selectedNodeId, graphData, mode]);

  const handleEngineStop = useCallback(() => {
    const fg = mode === "3d" ? fg3dRef.current : fg2dRef.current;
    fg?.pauseAnimation?.();
    if (selectedNodeIdRef.current) return;
    if (initialFitDoneRef.current) return;
    initialFitDoneRef.current = true;
    fitGraphToView(mode, fg2dRef.current, fg3dRef.current);
  }, [mode]);

  const handleBackgroundClick = useCallback(() => {
    selectedNodeIdRef.current = null;
    lastClickRef.current = null;
    onSelectNodeRef.current(null);
    setHighlightIds(new Set());
  }, []);

  const handleNodeClick = useCallback(
    (node: RuntimeGraphNode) => {
      const forceNode = asForceGraphNode(node);
      const now = Date.now();
      const last = lastClickRef.current;
      if (last?.id === forceNode.id && now - last.time < 350) {
        lastClickRef.current = null;
        return;
      }
      lastClickRef.current = { id: forceNode.id, time: now };

      const kgNode = graph.nodes.find((n) => n.id === forceNode.id) ?? null;
      selectedNodeIdRef.current = forceNode.id;
      onSelectNodeRef.current(kgNode);
      setHighlightIds(neighborNodeIds(graphData, forceNode.id));
    },
    [graph.nodes, graphData]
  );

  const nodeColor = useCallback(
    (node: RuntimeGraphNode) =>
      resolveNodeColor(
        asForceGraphNode(node),
        theme,
        visibleNodeIds,
        highlightIds,
        selectedNodeId,
        repos
      ),
    [theme, visibleNodeIds, highlightIds, selectedNodeId, repos]
  );

  const nodeVisibility = useCallback(
    (node: RuntimeGraphNode) => isNodeVisible(node, visibleNodeIds),
    [visibleNodeIds]
  );

  const linkColor = useCallback(
    (link: ForceGraphLink) => {
      const typedLink = link as ForceGraphLink;
      if (!isForceGraphLinkVisible(typedLink, visibleNodeIds)) return theme.surfaceSecondary;
      const sourceId = runtimeLinkEndpointId(link.source);
      const targetId = runtimeLinkEndpointId(link.target);
      if (highlightIds.has(sourceId) && highlightIds.has(targetId)) return theme.warning;
      if (typedLink.crossRepo) return theme.crossRepo;
      return theme.textMuted;
    },
    [theme, visibleNodeIds, highlightIds]
  );

  const linkVisibility = useCallback(
    (link: ForceGraphLink) => isForceGraphLinkVisible(link as ForceGraphLink, visibleNodeIds),
    [visibleNodeIds]
  );

  const linkWidth = useCallback(
    (link: ForceGraphLink) => {
      if (!isForceGraphLinkVisible(link as ForceGraphLink, visibleNodeIds)) return 0;
      const sourceId = runtimeLinkEndpointId(link.source);
      const targetId = runtimeLinkEndpointId(link.target);
      const highlighted = highlightIds.has(sourceId) && highlightIds.has(targetId);
      const typed = link as ForceGraphLink;
      if (typed.crossRepo) return highlighted ? 3.5 : 2.2;
      return highlighted ? 2.5 : 1;
    },
    [visibleNodeIds, highlightIds]
  );

  const linkLineDash = useCallback(
    (link: ForceGraphLink) => {
      const typed = link as ForceGraphLink;
      if (!typed.crossRepo) return null;
      return [6, 3] as [number, number];
    },
    []
  );

  const paintNodeLabel = useCallback(
    (node: RuntimeGraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      if (!isNodeVisible(node, visibleNodeIds)) return;
      if (globalScale < 0.3) return;

      const label = (node.label ?? String(node.id ?? "")).slice(0, 48);
      if (!label) return;

      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const fontSize = Math.max(10 / globalScale, 2.5);
      const offsetY = 10 / globalScale;

      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.lineWidth = Math.max(2 / globalScale, 0.5);
      ctx.strokeStyle = theme.surfaceSecondary;
      ctx.strokeText(label, x, y + offsetY);
      ctx.fillStyle = theme.textPrimary;
      ctx.fillText(label, x, y + offsetY);
    },
    [theme.surfaceSecondary, theme.textPrimary, visibleNodeIds]
  );

  const nodeThreeObject = useCallback(
    (node: RuntimeGraphNode): Object3D | false => {
      if (!labelSpritesReady || !isNodeVisible(node, visibleNodeIds)) return false;
      const create = createLabelSpriteRef.current;
      if (!create) return false;
      const label = (node.label ?? String(node.id ?? "")).slice(0, 36);
      return create(label, theme.textPrimary) ?? false;
    },
    [labelSpritesReady, theme.textPrimary, visibleNodeIds]
  );

  const graphProps = {
    graphData,
    width: dimensions.width,
    height: dimensions.height,
    warmupTicks: 80,
    cooldownTicks: 60,
    cooldownTime: 2500,
    d3AlphaDecay: 0.03,
    d3VelocityDecay: 0.35,
    enableNodeDrag: true,
    nodeLabel: (node: RuntimeGraphNode) => node.label ?? String(node.id ?? ""),
    nodeRelSize: 6,
    nodeColor,
    linkColor,
    linkWidth,
    onNodeClick: handleNodeClick,
    onBackgroundClick: handleBackgroundClick,
    onEngineStop: handleEngineStop,
  };

  return (
    <div className="graph-canvas-wrap">
      <div ref={containerRef} className="graph-canvas">
        {mode === "3d" ? (
          <ForceGraph3D
            ref={fg3dRef as RefObject<never>}
            {...graphProps}
            backgroundColor={theme.surfaceSecondary}
            showNavInfo={false}
            nodeThreeObjectExtend={true}
            nodeThreeObject={nodeThreeObject as never}
            nodeVisibility={nodeVisibility}
            nodeVal={(node: RuntimeGraphNode) =>
              isNodeVisible(node, visibleNodeIds) ? 6 : 0.5
            }
          />
        ) : (
          <ForceGraph2D
            ref={fg2dRef as RefObject<never>}
            {...graphProps}
            backgroundColor={theme.surfaceSecondary}
            nodeVisibility={nodeVisibility}
            linkVisibility={linkVisibility}
            linkLineDash={linkLineDash}
            nodeCanvasObjectMode="after"
            nodeCanvasObject={paintNodeLabel}
          />
        )}
      </div>
    </div>
  );
}
