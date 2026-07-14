import { normalizeGraphifyJson } from "./normalize-graphify";
import type { KnowledgeGraphJson } from "./types";

/**
 * Adapter function that converts raw Graphify node-link JSON payload
 * into the canonical headless KnowledgeGraph contract.
 */
export function graphifyAdapter(rawJsonText: string): KnowledgeGraphJson {
  return normalizeGraphifyJson(JSON.parse(rawJsonText));
}
