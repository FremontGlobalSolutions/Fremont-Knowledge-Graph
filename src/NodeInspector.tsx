import type { KnowledgeGraphJson, KnowledgeGraphNode } from "./types";
import {
  asKnowledgeGraphNodeDetail,
  knowledgeGraphNodeExtraFields,
  knowledgeGraphNodeFile,
  knowledgeGraphNodeLocation,
  knowledgeGraphNodeNeighbors,
} from "./node-details";

type Props = {
  node: KnowledgeGraphNode;
  graph: KnowledgeGraphJson;
  onSelectNeighbor?: (nodeId: string) => void;
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}: </span>
      <span className="detail-value">{value}</span>
    </div>
  );
}

export function NodeInspector({ node, graph, onSelectNeighbor }: Props) {
  const detail = asKnowledgeGraphNodeDetail(node);
  const file = knowledgeGraphNodeFile(node);
  const location = knowledgeGraphNodeLocation(detail);
  const neighbors = knowledgeGraphNodeNeighbors(graph, node.id);
  const extras = knowledgeGraphNodeExtraFields(detail);

  return (
    <div className="node-inspector">
      <p className="node-inspector-title">{node.label ?? node.id}</p>

      <div className="node-inspector-fields">
        <DetailRow label="ID" value={node.id} />
        {node.repo && <DetailRow label="Repo" value={node.repo} />}
        {node.type && <DetailRow label="Type" value={node.type} />}
        {node.kind && <DetailRow label="Kind" value={node.kind} />}
        {node.group && <DetailRow label="Group" value={node.group} />}
        {file && <DetailRow label="File" value={file} />}
        {location && <DetailRow label="Location" value={location} />}
        {detail.community != null && <DetailRow label="Cluster" value={String(detail.community)} />}
        {detail.norm_label && detail.norm_label !== node.label && (
          <DetailRow label="Normalized label" value={detail.norm_label} />
        )}
      </div>

      {neighbors.length > 0 && (
        <div className="node-inspector-section">
          <p className="node-inspector-heading">Connections ({neighbors.length})</p>
          <ul className="node-inspector-links">
            {neighbors.map((link) => (
              <li key={`${link.direction}-${link.neighborId}-${link.relation}`}>
                {onSelectNeighbor ? (
                  <button type="button" className="neighbor-btn" onClick={() => onSelectNeighbor(link.neighborId)}>
                    {link.direction === "out" ? "→" : "←"} {link.relation}: {link.neighborLabel}
                    {link.crossRepo && link.importSpecifier ? ` (${link.importSpecifier})` : ""}
                    {link.crossRepo && !link.importSpecifier ? " [cross-repo]" : ""}
                  </button>
                ) : (
                  <span className="detail-value">
                    {link.direction === "out" ? "→" : "←"} {link.relation}: {link.neighborLabel}
                    {link.crossRepo ? " [cross-repo]" : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {extras.length > 0 && (
        <div className="node-inspector-section">
          <p className="node-inspector-heading">Additional metadata</p>
          <ul className="node-inspector-links">
            {extras.map((row) => (
              <li key={row.key} className="detail-value">
                <span className="detail-mono">{row.key}</span>: {row.value}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
