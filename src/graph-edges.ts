import type { KnowledgeGraphEdge, KnowledgeGraphJson } from "./types";

type GraphWithLinks = KnowledgeGraphJson & { links?: KnowledgeGraphEdge[] };

export function resolveKnowledgeGraphEdges(graph: KnowledgeGraphJson): KnowledgeGraphEdge[] {
  if (graph.edges?.length) return graph.edges;
  const links = (graph as GraphWithLinks).links;
  return links ?? [];
}

export function resolveKnowledgeGraphNodeFile(node: {
  file?: string;
  path?: string;
  source_file?: string;
}): string | undefined {
  return node.file ?? node.path ?? node.source_file;
}
