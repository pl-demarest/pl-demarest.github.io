import { LAYOUT } from '../content/layout';
import { SECTIONS } from '../content/site';
import type { OrbitLayout, Section, SiteNode } from '../content/types';

/** A content node with its angle on the orbit. */
export interface NodeConfig extends SiteNode {
  angleOffset: number;
}

/** A section joined with its orbit layout: what one OrbitalRing renders. */
export interface OrbitalConfig extends Omit<OrbitLayout, 'nodeAngles'> {
  id: string;
  label: string;
  nodes: NodeConfig[];
}

/** Join each section with its layout. Throws if a section or node has no placement. */
export function buildOrbitals(
  sections: readonly Section[],
  layout: Readonly<Record<string, OrbitLayout>>,
): OrbitalConfig[] {
  return sections.map(section => {
    const orbit = layout[section.id];
    if (!orbit) throw new Error(`section "${section.id}" has no layout`);
    const { nodeAngles, ...placement } = orbit;
    return {
      id: section.id,
      label: section.label,
      ...placement,
      nodes: section.nodes.map(node => {
        const angleOffset = nodeAngles[node.id];
        if (angleOffset === undefined) throw new Error(`node "${node.id}" has no angle in the layout`);
        return { ...node, angleOffset };
      }),
    };
  });
}

export const ORBITALS: OrbitalConfig[] = buildOrbitals(SECTIONS, LAYOUT);

export const NODE_RADIUS = 0.18;

export const PARTICLE_CONFIG = {
  backgroundCount: 120,
  foregroundCount: 50,
  backgroundDepthRange: [-6, -1] as [number, number],
  foregroundDepthRange: [1, 4] as [number, number],
  spread: 16,
  driftSpeed: 0.002,
};
