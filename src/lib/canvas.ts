// STORY-039 — Migrate canvas generation to TypeScript
// canvas.ts — Shared utilities for JSON Canvas 1.0 spec-compliant file generation.
//
// Exports:
//   - CanvasNode, CanvasEdge, CanvasData, CanvasResult (types)
//   - deterministicHexId(path, type) — 16-char hex node ID (SHA-256 based)
//   - EDGE_COLORS — relationship type → hex color map
//   - NODE_GAP_X, NODE_GAP_Y, NODE_W, NODE_H — layout constants

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// JSON Canvas 1.0 types
// ---------------------------------------------------------------------------

export type CanvasSide = 'top' | 'bottom' | 'left' | 'right';
export type CanvasColor = '1' | '2' | '3' | '4' | '5' | '6' | string;

export interface CanvasNode {
  id: string;
  type: 'text';
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: CanvasColor;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide: CanvasSide;
  toNode: string;
  toSide: CanvasSide;
  toEnd: 'arrow';
  label?: string;
  color?: string;
}

export interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface CanvasResult {
  ok: boolean;
  data: CanvasData;
  outputPath: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Layout constants (JSON Canvas spec uses px units)
// ---------------------------------------------------------------------------

export const NODE_W = 400;
export const NODE_H = 200;
export const NODE_GAP_X = 520; // horizontal gap between depth levels
export const NODE_GAP_Y = 260; // vertical gap between siblings

// ---------------------------------------------------------------------------
// Edge color map — relationship type → hex color string
// ---------------------------------------------------------------------------

export const EDGE_COLORS: Record<string, string> = {
  'parent-of': '#4488FF', // blue
  'depends-on': '#9955FF', // purple
  'related-to': '#888888', // gray
  triggers: '#44BB44', // green
  implements: '#FF8800', // orange
};

// ---------------------------------------------------------------------------
// Deterministic 16-char hex ID (SHA-256 of "path\x00type")
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic 16-character lowercase hex ID.
 * Consistent across re-runs for the same path + type pair.
 */
export function deterministicHexId(path: string, type: string): string {
  return createHash('sha256')
    .update(path + '\x00' + type)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Generate a deterministic 16-character hex ID for an edge
 * based on fromNode + toNode + label.
 */
export function deterministicEdgeId(fromNode: string, toNode: string, label: string): string {
  return createHash('sha256')
    .update(fromNode + '\x00' + toNode + '\x00' + label)
    .digest('hex')
    .slice(0, 16);
}
