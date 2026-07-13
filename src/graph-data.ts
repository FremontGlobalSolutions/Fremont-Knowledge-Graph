import {
  resolveKnowledgeGraphEdges,
  resolveKnowledgeGraphNodeFile,
} from "./graph-edges";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphJson,
  KnowledgeGraphNode,
} from "./types";

export type ForceGraphNode = {
  id: string;
  label: string;
  type: string;
  file: string;
  repo?: string;
};

export type ForceGraphLink = {
  id: string;
  source: string | { id: string };
  target: string | { id: string };
  label: string;
  crossRepo?: boolean;
  edgeType?: string;
};

export function linkEndpointId(endpoint: string | { id: string }): string {
  return typeof endpoint === "object" ? endpoint.id : endpoint;
}

export type ForceGraphData = {
  nodes: ForceGraphNode[];
  links: ForceGraphLink[];
};

export type KnowledgeGraphFilterOptions = {
  search: string;
  folderFilter: string;
  hiddenRepos: Set<string>;
};

export function nodeLabel(node: KnowledgeGraphNode): string {
  return node.label ?? node.id;
}

export function nodeFile(node: KnowledgeGraphNode): string | undefined {
  return resolveKnowledgeGraphNodeFile(node);
}

export function matchesFolder(node: KnowledgeGraphNode, folder: string): boolean {
  if (!folder.trim()) return true;
  const file = nodeFile(node);
  if (!file) return node.id.toLowerCase().includes(folder.toLowerCase());
  return file
    .replace(/\\/g, "/")
    .toLowerCase()
    .startsWith(folder.replace(/\\/g, "/").toLowerCase());
}

export function isKnowledgeGraphNodeVisible(
  node: KnowledgeGraphNode,
  { search, folderFilter, hiddenRepos }: KnowledgeGraphFilterOptions
): boolean {
  if (node.repo && hiddenRepos.has(node.repo)) return false;
  const query = search.trim().toLowerCase();
  const matchesSearch =
    !query ||
    nodeLabel(node).toLowerCase().includes(query) ||
    node.id.toLowerCase().includes(query) ||
    (node.repo?.toLowerCase().includes(query) ?? false);
  return matchesSearch && matchesFolder(node, folderFilter);
}

export function buildVisibleNodeIdSet(
  graph: KnowledgeGraphJson,
  filters: KnowledgeGraphFilterOptions
): Set<string> {
  const visible = new Set<string>();
  for (const node of graph.nodes) {
    if (isKnowledgeGraphNodeVisible(node, filters)) {
      visible.add(node.id);
    }
  }
  return visible;
}

export function isForceGraphLinkVisible(
  link: ForceGraphLink,
  visibleNodeIds: Set<string>
): boolean {
  const sourceId = linkEndpointId(link.source);
  const targetId = linkEndpointId(link.target);
  return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
}

export function buildForceGraphData(graph: KnowledgeGraphJson): ForceGraphData {
  const edges = resolveKnowledgeGraphEdges(graph);
  const nodes: ForceGraphNode[] = graph.nodes.map((n) => ({
    id: n.id,
    label: nodeLabel(n),
    type: n.type ?? "node",
    file: nodeFile(n) ?? "",
    repo: typeof n.repo === "string" ? n.repo : undefined,
  }));
  const links: ForceGraphLink[] = edges.map((e: KnowledgeGraphEdge, i) => ({
    id: e.id ?? `e-${i}-${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    label: e.label ?? e.type ?? "",
    crossRepo: e.crossRepo === true,
    edgeType: e.type,
  }));
  return { nodes, links };
}

export function computeForceLayoutTuning(nodeCount: number): {
  chargeStrength: number;
  linkDistance: number;
} {
  if (nodeCount > 2000) {
    return { chargeStrength: -320, linkDistance: 90 };
  }
  if (nodeCount > 1000) {
    return { chargeStrength: -240, linkDistance: 70 };
  }
  if (nodeCount > 500) {
    return { chargeStrength: -180, linkDistance: 55 };
  }
  return { chargeStrength: -120, linkDistance: 40 };
}

export function uniqueRepos(graph: KnowledgeGraphJson): string[] {
  const repos = new Set<string>();
  for (const node of graph.nodes) {
    if (typeof node.repo === "string" && node.repo) repos.add(node.repo);
  }
  return [...repos].sort();
}
