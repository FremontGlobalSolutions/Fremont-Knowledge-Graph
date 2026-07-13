import { resolveKnowledgeGraphEdges, resolveKnowledgeGraphNodeFile } from "./graph-edges";
import type { KnowledgeGraphJson, KnowledgeGraphNode, KnowledgeGraphEdge } from "./types";

export type KnowledgeGraphNodeDetail = KnowledgeGraphNode & {
  source_location?: string;
  source_file?: string;
  community?: number;
  norm_label?: string;
  file_type?: string;
};

export type KnowledgeGraphNeighborLink = {
  direction: "out" | "in";
  relation: string;
  neighborId: string;
  neighborLabel: string;
  crossRepo?: boolean;
  importSpecifier?: string;
};

const DISPLAYED_NODE_KEYS = new Set([
  "id",
  "label",
  "type",
  "file",
  "path",
  "kind",
  "group",
  "repo",
  "source_location",
  "source_file",
  "community",
  "norm_label",
  "file_type",
  "data",
]);

export function asKnowledgeGraphNodeDetail(node: KnowledgeGraphNode): KnowledgeGraphNodeDetail {
  return node as KnowledgeGraphNodeDetail;
}

export function knowledgeGraphNodeFile(node: KnowledgeGraphNode): string | undefined {
  return resolveKnowledgeGraphNodeFile(node);
}

export function knowledgeGraphNodeLocation(node: KnowledgeGraphNodeDetail): string | undefined {
  return node.source_location;
}

export function knowledgeGraphNodeNeighbors(
  graph: KnowledgeGraphJson,
  nodeId: string
): KnowledgeGraphNeighborLink[] {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const edges = resolveKnowledgeGraphEdges(graph);
  const links: KnowledgeGraphNeighborLink[] = [];

  for (const edge of edges) {
    const raw = edge as KnowledgeGraphEdge & { relation?: string; crossRepo?: boolean; importSpecifier?: string };
    const relation = edge.label ?? edge.type ?? raw.relation ?? "related";
    const crossRepo = raw.crossRepo === true;
    const importSpecifier = raw.importSpecifier;
    if (edge.source === nodeId) {
      const neighbor = nodeById.get(edge.target);
      links.push({
        direction: "out",
        relation,
        neighborId: edge.target,
        neighborLabel: neighbor?.label ?? edge.target,
        crossRepo,
        importSpecifier,
      });
    } else if (edge.target === nodeId) {
      const neighbor = nodeById.get(edge.source);
      links.push({
        direction: "in",
        relation,
        neighborId: edge.source,
        neighborLabel: neighbor?.label ?? edge.source,
        crossRepo,
        importSpecifier,
      });
    }
  }

  return links.sort((a, b) => a.neighborLabel.localeCompare(b.neighborLabel));
}

export function knowledgeGraphNodeExtraFields(
  node: KnowledgeGraphNodeDetail
): Array<{ key: string; value: string }> {
  const rows: Array<{ key: string; value: string }> = [];
  const record = node as Record<string, unknown>;

  for (const [key, value] of Object.entries(record)) {
    if (DISPLAYED_NODE_KEYS.has(key)) continue;
    if (value == null || typeof value === "object") continue;
    const text = String(value).trim();
    if (!text) continue;
    rows.push({ key, value: text });
  }

  if (node.data && typeof node.data === "object") {
    for (const [key, value] of Object.entries(node.data)) {
      if (value == null || typeof value === "object") continue;
      const text = String(value).trim();
      if (!text) continue;
      rows.push({ key: `data.${key}`, value: text });
    }
  }

  return rows.sort((a, b) => a.key.localeCompare(b.key));
}
