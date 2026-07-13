import type { KnowledgeGraphEdge, KnowledgeGraphJson, KnowledgeGraphNode } from "./types";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function normalizeNode(raw: unknown): KnowledgeGraphNode {
  const node = asRecord(raw);
  const file =
    (typeof node.file === "string" && node.file) ||
    (typeof node.path === "string" && node.path) ||
    (typeof node.source_file === "string" && node.source_file) ||
    undefined;
  const type =
    (typeof node.type === "string" && node.type) ||
    (typeof node.file_type === "string" && node.file_type) ||
    undefined;
  return {
    ...node,
    id: String(node.id ?? ""),
    label: typeof node.label === "string" ? node.label : undefined,
    type,
    file,
    path: typeof node.path === "string" ? node.path : file,
    kind: typeof node.kind === "string" ? node.kind : undefined,
    group: typeof node.group === "string" ? node.group : undefined,
    repo: typeof node.repo === "string" ? node.repo : undefined,
  };
}

function normalizeEdge(raw: unknown, index: number): KnowledgeGraphEdge {
  const edge = asRecord(raw);
  const source = String(edge.source ?? edge._src ?? "");
  const target = String(edge.target ?? edge._tgt ?? "");
  const relation =
    (typeof edge.relation === "string" && edge.relation) ||
    (typeof edge.type === "string" && edge.type) ||
    undefined;
  const label = (typeof edge.label === "string" && edge.label) || relation || undefined;
  return {
    ...edge,
    id: typeof edge.id === "string" ? edge.id : `e-${index}-${source}-${target}`,
    source,
    target,
    type: relation ?? (typeof edge.type === "string" ? edge.type : undefined),
    label,
  };
}

function rawEdgesFromPayload(raw: Record<string, unknown>): unknown[] {
  if (Array.isArray(raw.edges) && raw.edges.length > 0) return raw.edges;
  if (Array.isArray(raw.links)) return raw.links;
  return [];
}

/** Normalize graphify 0.6 NetworkX node-link JSON into viewer shape. */
export function normalizeGraphifyJson(raw: unknown): KnowledgeGraphJson {
  const obj = asRecord(raw);
  const nodes = Array.isArray(obj.nodes) ? obj.nodes.map(normalizeNode) : [];
  const edges = rawEdgesFromPayload(obj).map(normalizeEdge);
  const metadata =
    obj.metadata != null && typeof obj.metadata === "object"
      ? (obj.metadata as Record<string, unknown>)
      : undefined;
  return { nodes, edges, metadata };
}

export function parseGraphJson(text: string): KnowledgeGraphJson {
  return normalizeGraphifyJson(JSON.parse(text));
}
