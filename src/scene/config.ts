export interface NodeConfig {
  id: string;
  label: string;
  description: string;
  angleOffset: number;
  type: 'group' | 'project';
}

export interface OrbitalConfig {
  id: string;
  label: string;
  radiusX: number;
  radiusY: number;
  tilt: { x: number; z: number };
  speed: number;
  couplingFactor: number;
  nodes: NodeConfig[];
}

export const ORBITALS: OrbitalConfig[] = [
  {
    id: 'publications',
    label: 'Publications',
    radiusX: 2.2,
    radiusY: 1.6,
    tilt: { x: 0.25, z: 0.3 },
    speed: 0.15,
    couplingFactor: 0.4,
    nodes: [
      {
        id: 'papers',
        label: 'Papers',
        description: 'Peer-reviewed research publications',
        angleOffset: 0,
        type: 'group',
      },
      {
        id: 'patents',
        label: 'Patents',
        description: 'Granted and pending patent filings',
        angleOffset: (2 * Math.PI) / 3,
        type: 'group',
      },
      {
        id: 'presentations',
        label: 'Presentations',
        description: 'Conference talks, posters, and invited lectures',
        angleOffset: (4 * Math.PI) / 3,
        type: 'group',
      },
    ],
  },
  {
    id: 'experiences',
    label: 'Experiences',
    radiusX: 3.2,
    radiusY: 2.3,
    tilt: { x: -0.15, z: -0.2 },
    speed: 0.1,
    couplingFactor: 0.35,
    nodes: [
      {
        id: 'academic',
        label: 'Academic',
        description: 'Research positions, teaching, and institutional affiliations',
        angleOffset: 0.4,
        type: 'group',
      },
      {
        id: 'professional',
        label: 'Professional',
        description: 'Industry roles, consulting engagements, and collaborations',
        angleOffset: 0.4 + Math.PI,
        type: 'group',
      },
    ],
  },
  {
    id: 'projects',
    label: 'Projects',
    radiusX: 4.2,
    radiusY: 3.0,
    tilt: { x: 0.1, z: -0.25 },
    speed: 0.08,
    couplingFactor: 0.3,
    nodes: [
      {
        id: 'engagements',
        label: 'Engagements',
        description: 'Applied projects, client work, and cross-disciplinary initiatives',
        angleOffset: 0.9,
        type: 'group',
      },
      {
        id: 'code',
        label: 'Code',
        description: 'Open source libraries, tools, and software projects',
        angleOffset: 0.9 + Math.PI,
        type: 'group',
      },
    ],
  },
];

export const NODE_RADIUS = 0.18;

export const PARTICLE_CONFIG = {
  backgroundCount: 120,
  foregroundCount: 50,
  backgroundDepthRange: [-6, -1] as [number, number],
  foregroundDepthRange: [1, 4] as [number, number],
  spread: 16,
  driftSpeed: 0.002,
};
