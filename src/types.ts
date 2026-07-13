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

/** Information about a discovered repository within the workspace. */
export type RepoInfo = {
  name: string;
  path: string;
  hasGraph: boolean;
  isGit: boolean;
  nodeCount: number;
  edgeCount: number;
  indexedAt: string | null;
};

/** Status of a background indexing job. */
export type IndexingJob = {
  repo: string;
  status: "running" | "success" | "error";
  startTime: string;
  endTime?: string;
  error?: string;
};

/** Persisted viewer configuration. */
export type ViewerConfig = {
  workspaceRoot: string;
  /** Repo folder names shown in the sidebar. Empty = none until configured. */
  visibleRepos: string[];
};
