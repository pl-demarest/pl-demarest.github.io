import { own } from './own';
import type { Link, NodeAction, OrbitLayout, Section } from './types';

/**
 * An id becomes a DOM id, an aria-controls value and a key in CSS
 * selectors: one token of letters, digits, '-' and '_'.
 */
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * Check sections against their layout. Returns one message per problem; an
 * empty array means the content is valid. Ids must be unique across sections
 * and nodes together, because both become DOM ids and scene lookup keys.
 */
export function validateContent(
  sections: readonly Section[],
  layout: Readonly<Record<string, OrbitLayout>>,
): string[] {
  const problems: string[] = [];
  const owners = new Map<string, 'section' | 'node'>();
  const sectionIds = new Set(sections.map(s => s.id));

  const claimId = (id: string, kind: 'section' | 'node'): void => {
    if (id.trim() === '') {
      problems.push(`${kind} "${id}" has an empty id`);
      return;
    }
    if (!ID.test(id)) {
      problems.push(`${kind} "${id}" id may hold only letters, digits, "-" and "_", and must start with a letter or digit`);
    }
    const first = owners.get(id);
    if (first === undefined) owners.set(id, kind);
    else problems.push(`duplicate id "${id}" (${first} and ${kind})`);
  };

  for (const section of sections) {
    const where = `section "${section.id}"`;
    claimId(section.id, 'section');
    if (section.label.trim() === '') problems.push(`${where} has an empty label`);

    const orbit = own(layout, section.id);
    if (orbit) problems.push(...checkOrbit(orbit, section, where));
    else problems.push(`${where} has no layout`);

    for (const node of section.nodes) {
      const nodeWhere = `node "${node.id}"`;
      claimId(node.id, 'node');
      if (node.label.trim() === '') problems.push(`${nodeWhere} has an empty label`);
      problems.push(...checkAction(node.action, nodeWhere, section.id, sectionIds));
      for (const link of node.links ?? []) problems.push(...checkLink(link, nodeWhere));
    }
  }

  for (const id of Object.keys(layout)) {
    if (!sectionIds.has(id)) problems.push(`layout "${id}" has no section`);
  }
  return problems;
}

function checkOrbit(orbit: OrbitLayout, section: Section, where: string): string[] {
  const problems: string[] = [];
  const numbers: Array<[string, number]> = [
    ['radiusX', orbit.radiusX],
    ['radiusY', orbit.radiusY],
    ['tilt.x', orbit.tilt.x],
    ['tilt.z', orbit.tilt.z],
    ['speed', orbit.speed],
    ['couplingFactor', orbit.couplingFactor],
  ];
  for (const [name, value] of numbers) {
    if (!Number.isFinite(value)) problems.push(`${where} layout ${name} is not a finite number`);
  }

  const nodeIds = new Set(section.nodes.map(n => n.id));
  for (const id of nodeIds) {
    const angle = own(orbit.nodeAngles, id);
    if (angle === undefined || !Number.isFinite(angle)) {
      problems.push(`node "${id}" has no finite angle in the layout of ${where}`);
    }
  }
  for (const id of Object.keys(orbit.nodeAngles)) {
    if (!nodeIds.has(id)) problems.push(`${where} layout places "${id}", which is not one of its nodes`);
  }
  return problems;
}

function checkAction(
  action: NodeAction,
  where: string,
  ownSection: string,
  sectionIds: ReadonlySet<string>,
): string[] {
  switch (action.kind) {
    case 'none':
      return [];
    case 'external':
      return isHttpUrl(action.href)
        ? []
        : [`${where} external action needs an absolute http(s) URL, got "${action.href}"`];
    case 'route':
      return isSitePath(action.path)
        ? []
        : [`${where} route action needs a path on this site, starting with "/", got "${action.path}"`];
    case 'suborbital':
      if (action.sectionId === ownSection) return [`${where} suborbital action points at its own section`];
      return sectionIds.has(action.sectionId)
        ? []
        : [`${where} suborbital action names unknown section "${action.sectionId}"`];
    default: {
      // Reachable only from untyped data, such as content loaded from JSON.
      const unknown: never = action;
      return [`${where} has an unknown action ${JSON.stringify(unknown)}`];
    }
  }
}

function checkLink(link: Link, where: string): string[] {
  const problems: string[] = [];
  if (link.label.trim() === '') problems.push(`${where} has a link with an empty label`);
  if (!isHttpUrl(link.href) && !isSitePath(link.href)) {
    problems.push(`${where} link "${link.label}" needs an absolute http(s) URL or a path on this site, starting with "/"`);
  }
  return problems;
}

function isHttpUrl(href: string): boolean {
  try {
    const { protocol } = new URL(href);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** A placeholder origin: what matters is whether a path stays on it. */
const SITE = 'https://site.invalid';

/**
 * A root-relative path that a browser resolves on this site. URL parsing
 * reads a backslash as a slash and drops tabs and newlines, so a path such
 * as '/\\evil.example' or '/\t/evil.example' leaves the site, as '//evil.example' does.
 */
function isSitePath(path: string): boolean {
  if (!path.startsWith('/')) return false;
  try {
    return new URL(path, SITE).origin === SITE;
  } catch {
    return false;
  }
}
