export interface FunctionInfo {
  name: string;
  startLine: number;
  endLine: number;
  file: string;
  paramsString: string;
}

export interface GraphNodeData {
  id: string;
  type: 'function' | 'call';
  reachable: string;
  displayName: string;
  truncatedLabel: string;
  fullLabel: string;
  locationInfo: string;
  file?: string;
  startLine?: number;
  jellyId?: string;
}

export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  asyncOrExternal?: boolean;
}

export interface GraphNode {
  data: GraphNodeData;
}

export interface GraphEdge {
  data: GraphEdgeData;
}

export type CytoscapeElement = GraphNode | GraphEdge;

export interface CallGraphData {
  files?: string[];
  functions?: Record<string, string>;
  calls?: Record<string, string>;
  fun2fun?: [string, string][];
  call2fun?: [string, string][];
}
