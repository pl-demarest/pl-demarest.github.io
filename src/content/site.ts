import type { CloudContent, Section } from './types';

/** The site's sections in display order: inner orbit first, top of the panel first. */
export const SECTIONS: Section[] = [
  {
    id: 'publications',
    label: 'Publications',
    nodes: [
      {
        id: 'papers',
        label: 'Papers',
        description: 'Peer-reviewed research publications',
        action: { kind: 'none' },
      },
      {
        id: 'patents',
        label: 'Patents',
        description: 'Granted and pending patent filings',
        action: { kind: 'none' },
      },
      {
        id: 'presentations',
        label: 'Presentations',
        description: 'Conference talks, posters, and invited lectures',
        action: { kind: 'none' },
      },
    ],
  },
  {
    id: 'experiences',
    label: 'Experiences',
    nodes: [
      {
        id: 'academic',
        label: 'Academic',
        description: 'Research positions, teaching, and institutional affiliations',
        action: { kind: 'none' },
      },
      {
        id: 'professional',
        label: 'Professional',
        description: 'Industry roles, consulting engagements, and collaborations',
        action: { kind: 'none' },
      },
    ],
  },
  {
    id: 'projects',
    label: 'Projects',
    nodes: [
      {
        id: 'engagements',
        label: 'Engagements',
        description: 'Applied projects, client work, and cross-disciplinary initiatives',
        action: { kind: 'none' },
      },
      {
        id: 'code',
        label: 'Code',
        description: 'Open source libraries, tools, and software projects',
        action: { kind: 'none' },
        // PEABrain is VERA-aligned MATLAB. Its derived demo geometry goes in
        // public/peabrain-demo/, which Vite serves at the site root:
        // /peabrain-demo/ (import.meta.env.BASE_URL + 'peabrain-demo/').
        links: [{ label: 'PEABrain', href: 'https://github.com/pl-demarest/PEABrain' }],
      },
    ],
  },
];

/**
 * No cloud asset exists yet, so the app does not load CloudLayer. When
 * cloud-designer exports one, put it in public/ and name it here.
 */
export const CLOUDS: CloudContent = { asset: null };
