export type KnowledgeGraphNode = {
  id: string;
  label?: string;
  type?: string;
  file?: string;
  path?: string;
  kind?: string;
  group?: string;
  repo?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

export type KnowledgeGraphEdge = {
  id?: string;
  source: string;
  target: string;
  type?: string;
  label?: string;
  crossRepo?: boolean;
  importSpecifier?: string;
  packageName?: string;
};

export type KnowledgeGraphJson = {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  metadata?: Record<string, unknown>;
};

export type GraphRenderMode = "2d" | "3d";

export type RepoStat = {
  name: string;
  nodeCount: number;
  edgeCount: number;
};
