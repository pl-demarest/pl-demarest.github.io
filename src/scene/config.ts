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
    id: 'research',
    label: 'Research',
    radiusX: 2.8,
    radiusY: 2.0,
    tilt: { x: 0.15, z: 0.2 },
    speed: 0.15,
    couplingFactor: 0.4,
    nodes: [
      {
        id: 'neuro-connectivity',
        label: 'Neural Connectivity',
        description: 'Intracranial EEG connectivity modeling of cingulate subregions',
        angleOffset: 0,
        type: 'project',
      },
      {
        id: 'glymphatic',
        label: 'Glymphatic Modulation',
        description: 'Vibrotactile stimulation for CNS waste clearance optimization',
        angleOffset: (2 * Math.PI) / 3,
        type: 'project',
      },
      {
        id: 'brain-projections',
        label: 'Brain Region Projections',
        description: 'Patient-specific brain region mapping into MNI space',
        angleOffset: (4 * Math.PI) / 3,
        type: 'project',
      },
    ],
  },
  {
    id: 'engineering',
    label: 'Engineering',
    radiusX: 3.8,
    radiusY: 2.8,
    tilt: { x: -0.2, z: -0.3 },
    speed: 0.1,
    couplingFactor: 0.35,
    nodes: [
      {
        id: 'theta-hand',
        label: 'ThetaHand',
        description: 'Wearable EEG + haptic neurostimulation device',
        angleOffset: 0.5,
        type: 'project',
      },
      {
        id: 'neural-sync',
        label: 'NeuralSync',
        description: 'AI workflow synchronization platform',
        angleOffset: 0.5 + (2 * Math.PI) / 3,
        type: 'project',
      },
      {
        id: 'grasshopper',
        label: 'Grasshopper',
        description: 'Algorithmic trading strategy for inverse ETF pairs',
        angleOffset: 0.5 + (4 * Math.PI) / 3,
        type: 'project',
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
