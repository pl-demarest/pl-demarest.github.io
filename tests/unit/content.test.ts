import { describe, expect, it } from 'vitest';
import { LAYOUT } from '../../src/content/layout';
import { CLOUDS, SECTIONS } from '../../src/content/site';
import type { NodeAction, OrbitLayout, Section } from '../../src/content/types';
import { validateContent } from '../../src/content/validate';
import { buildOrbitals, ORBITALS } from '../../src/scene/config';

/** A deep copy of the real content, so each case can break one thing. */
function copy(): { sections: Section[]; layout: Record<string, OrbitLayout> } {
  return structuredClone({ sections: SECTIONS, layout: LAYOUT });
}

const allNodes = () => SECTIONS.flatMap(s => s.nodes);

describe('site content', () => {
  it('passes validation', () => {
    expect(validateContent(SECTIONS, LAYOUT)).toEqual([]);
  });

  it('gives every node the "none" action, so activating a node does nothing yet', () => {
    for (const node of allNodes()) expect(node.action, node.id).toEqual({ kind: 'none' });
  });

  it('has no cloud asset yet', () => {
    expect(CLOUDS).toEqual({ asset: null });
  });

  it('keeps URLs out of descriptions: the PEABrain repository is a link on the Code node', () => {
    const code = allNodes().find(n => n.id === 'code')!;
    expect(code.links).toEqual([{ label: 'PEABrain', href: 'https://github.com/pl-demarest/PEABrain' }]);
    for (const node of allNodes()) expect(node.description, node.id).not.toMatch(/https?:|\/public\//);
  });
});

describe('validateContent', () => {
  it('reports ids that repeat across sections and nodes, and empty ids', () => {
    const { sections, layout } = copy();
    sections[0]!.nodes[0]!.id = 'projects'; // the id of a later section
    sections[1]!.nodes[1]!.id = 'academic'; // its sibling's id
    sections[2]!.nodes[0]!.id = ' ';
    const problems = validateContent(sections, layout);
    expect(problems).toContain('duplicate id "projects" (node and section)');
    expect(problems).toContain('duplicate id "academic" (node and node)');
    expect(problems).toContain('node " " has an empty id');
  });

  it('reports ids that are not single DOM tokens', () => {
    // An id becomes a DOM id and an aria-controls value, where a space
    // splits it in two, and a key in CSS selectors.
    const { sections, layout } = copy();
    sections[2]!.id = 'my projects';
    layout['my projects'] = layout['projects']!;
    delete layout['projects'];
    const rename = (section: number, node: number, id: string) => {
      const angles = layout[sections[section]!.id]!.nodeAngles;
      const n = sections[section]!.nodes[node]!;
      angles[id] = angles[n.id]!;
      delete angles[n.id];
      n.id = id;
    };
    rename(0, 0, 'papers"]');
    rename(1, 0, '-academic');
    expect(validateContent(sections, layout)).toEqual([
      'node "papers"]" id may hold only letters, digits, "-" and "_", and must start with a letter or digit',
      'node "-academic" id may hold only letters, digits, "-" and "_", and must start with a letter or digit',
      'section "my projects" id may hold only letters, digits, "-" and "_", and must start with a letter or digit',
    ]);
  });

  it('reports missing, non-finite and stray node angles', () => {
    const { sections, layout } = copy();
    const pub = layout['publications']!;
    delete pub.nodeAngles['papers'];
    pub.nodeAngles['patents'] = Number.NaN;
    pub.nodeAngles['presentations'] = Number.POSITIVE_INFINITY;
    pub.nodeAngles['ghost'] = 1;
    expect(validateContent(sections, layout)).toEqual([
      'node "papers" has no finite angle in the layout of section "publications"',
      'node "patents" has no finite angle in the layout of section "publications"',
      'node "presentations" has no finite angle in the layout of section "publications"',
      'section "publications" layout places "ghost", which is not one of its nodes',
    ]);
  });

  it('reports non-finite layout numbers', () => {
    const { sections, layout } = copy();
    layout['experiences']!.speed = Number.NaN;
    layout['experiences']!.tilt.z = Number.NEGATIVE_INFINITY;
    expect(validateContent(sections, layout)).toEqual([
      'section "experiences" layout tilt.z is not a finite number',
      'section "experiences" layout speed is not a finite number',
    ]);
  });

  it('accepts each well-formed action kind', () => {
    const { sections, layout } = copy();
    const [papers, patents, presentations] = sections[0]!.nodes;
    papers!.action = { kind: 'external', href: 'https://example.org/papers' };
    patents!.action = { kind: 'route', path: '/patents' };
    presentations!.action = { kind: 'suborbital', sectionId: 'projects' };
    expect(validateContent(sections, layout)).toEqual([]);
  });

  it('reports malformed actions', () => {
    const cases: Array<[NodeAction, string]> = [
      [{ kind: 'external', href: '/relative' }, 'node "papers" external action needs an absolute http(s) URL, got "/relative"'],
      [{ kind: 'external', href: 'javascript:alert(1)' }, 'node "papers" external action needs an absolute http(s) URL, got "javascript:alert(1)"'],
      [{ kind: 'route', path: 'projects' }, 'node "papers" route action needs a path on this site, starting with "/", got "projects"'],
      [{ kind: 'route', path: '//evil.example' }, 'node "papers" route action needs a path on this site, starting with "/", got "//evil.example"'],
      [{ kind: 'suborbital', sectionId: 'nowhere' }, 'node "papers" suborbital action names unknown section "nowhere"'],
      [{ kind: 'suborbital', sectionId: 'publications' }, 'node "papers" suborbital action points at its own section'],
      [{ kind: 'teleport' } as unknown as NodeAction, 'node "papers" has an unknown action {"kind":"teleport"}'],
    ];
    for (const [action, message] of cases) {
      const { sections, layout } = copy();
      sections[0]!.nodes[0]!.action = action;
      expect(validateContent(sections, layout), action.kind).toEqual([message]);
    }
  });

  it('reports a route or link path that a browser resolves to another site', () => {
    // URL parsing reads a backslash as a slash and drops tabs and newlines,
    // so each of these becomes //evil.example/...
    for (const path of ['/\\evil.example/x', '/\t/evil.example/x', '/\n/evil.example']) {
      const { sections, layout } = copy();
      sections[0]!.nodes[0]!.action = { kind: 'route', path };
      sections[2]!.nodes[1]!.links = [{ label: 'Elsewhere', href: path }];
      expect(validateContent(sections, layout), JSON.stringify(path)).toEqual([
        `node "papers" route action needs a path on this site, starting with "/", got "${path}"`,
        'node "code" link "Elsewhere" needs an absolute http(s) URL or a path on this site, starting with "/"',
      ]);
    }
    const { sections, layout } = copy();
    sections[0]!.nodes[0]!.action = { kind: 'route', path: '/talks/2026?x=1#y' };
    expect(validateContent(sections, layout)).toEqual([]);
  });

  it('reports links without a label or with an unusable href', () => {
    const { sections, layout } = copy();
    sections[2]!.nodes[1]!.links = [
      { label: '', href: '/peabrain-demo/' },
      { label: 'Repo', href: 'github.com/pl-demarest' },
    ];
    expect(validateContent(sections, layout)).toEqual([
      'node "code" has a link with an empty label',
      'node "code" link "Repo" needs an absolute http(s) URL or a path on this site, starting with "/"',
    ]);
  });

  it('reads only the layout\'s own entries, not those every object inherits', () => {
    // A section or node named like an Object.prototype member.
    const { sections, layout } = copy();
    sections[2]!.id = 'constructor';
    delete layout['projects'];
    expect(validateContent(sections, layout)).toEqual(['section "constructor" has no layout']);
  });

  it('reports a section without a layout and a layout without a section', () => {
    const { sections, layout } = copy();
    layout['elsewhere'] = layout['projects']!;
    delete layout['projects'];
    expect(validateContent(sections, layout)).toEqual([
      'section "projects" has no layout',
      'layout "elsewhere" has no section',
    ]);
  });
});

describe('buildOrbitals', () => {
  it('joins each section with its layout in section order', () => {
    expect(ORBITALS.map(o => o.id)).toEqual(SECTIONS.map(s => s.id));
    for (const orbital of ORBITALS) {
      const section = SECTIONS.find(s => s.id === orbital.id)!;
      const { nodeAngles, ...placement } = LAYOUT[orbital.id]!;
      expect(orbital).toMatchObject({ label: section.label, ...placement });
      expect(orbital.nodes).toEqual(section.nodes.map(n => ({ ...n, angleOffset: nodeAngles[n.id] })));
    }
  });

  it('throws for a section or node named like an inherited member, with no placement of its own', () => {
    const section = copy();
    section.sections[2]!.id = 'toString';
    delete section.layout['projects'];
    expect(() => buildOrbitals(section.sections, section.layout)).toThrow('section "toString" has no layout');
    const node = copy();
    node.sections[2]!.nodes[1]!.id = 'constructor';
    delete node.layout['projects']!.nodeAngles['code'];
    expect(() => buildOrbitals(node.sections, node.layout)).toThrow('node "constructor" has no angle in the layout');
  });

  it('throws when a section or a node has no placement', () => {
    const missingSection = copy();
    delete missingSection.layout['experiences'];
    expect(() => buildOrbitals(missingSection.sections, missingSection.layout)).toThrow(
      'section "experiences" has no layout',
    );
    const missingNode = copy();
    delete missingNode.layout['projects']!.nodeAngles['code'];
    expect(() => buildOrbitals(missingNode.sections, missingNode.layout)).toThrow('node "code" has no angle in the layout');
  });
});
