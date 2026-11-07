/**
 * What activating a node does. Every node is { kind: 'none' } today; the
 * other kinds are the targets Phase 2 adds (an external page, an internal
 * route, or a sub-orbit built from another section).
 */
export type NodeAction =
  | { kind: 'none' }
  | { kind: 'external'; href: string }
  | { kind: 'route'; path: string }
  | { kind: 'suborbital'; sectionId: string };

export interface Link {
  label: string;
  /** An absolute http(s) URL, or a root-relative path on this site. */
  href: string;
}

/** One entry on an orbit, and in the panel under its section. */
export interface SiteNode {
  id: string;
  label: string;
  description: string;
  action: NodeAction;
  links?: Link[];
}

/** One orbit in the scene and one category in the panel. */
export interface Section {
  id: string;
  label: string;
  nodes: SiteNode[];
}

/** Where and how a section's orbit sits in the scene. Holds no content. */
export interface OrbitLayout {
  radiusX: number;
  radiusY: number;
  tilt: { x: number; z: number };
  /** Cruise angular velocity in rad/s; negative turns the other way. */
  speed: number;
  couplingFactor: number;
  /** Each node's angle on the orbit in radians, keyed by node id. */
  nodeAngles: Record<string, number>;
}

/** The cloud layer: a GLB exported from cloud-designer and served from public/, or null for none. */
export interface CloudContent {
  /** Path of the GLB under the site root (for example 'clouds/default.glb'). */
  asset: string | null;
}
