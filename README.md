# pl-demarest.github.io

Interactive portfolio and CV built with **Vite + TypeScript + Three.js**. The landing page is a 3D orbital navigation: elliptical rings are the site's sections and wireframe sphere nodes are the entries in each. The panel beside the scene lists the same sections and is the scene's keyboard and screen-reader equivalent.

## Running locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check and production build to dist/
npm run check      # type-check, lint, unit tests and build
npm run test:e2e   # browser suite: Playwright with the installed Google Chrome
```

## Architecture

```
src/
  main.ts                  Entry point: starts the App
  app/
    App.ts                 Composition root: header and panel first, then the WebGL scene; dispose()
    store.ts               State shared by scene and panel: hovered ring and node (each with its source), selected ring
    sceneBinding.ts        Renders the store onto the scene: selected ring flat, hovered node highlighted
  content/
    types.ts               Section, SiteNode, NodeAction (none | external | route | suborbital), Link, OrbitLayout
    site.ts                The sections and their nodes: labels, descriptions, actions, links; CLOUDS
    layout.ts              Orbit placement per section: radii, tilt, cruise speed (rad/s), coupling, node angles
    validate.ts            validateContent(): unique ids, finite numbers, well-formed actions and links
  scene/
    SceneManager.ts        Renderer, camera presets, resize, animation loop
    OrbitalRing.ts         One ring: ellipse line, hit tube, nodes; spin, tilt and flat-view motion
    OrbitalNode.ts         One node: wireframe sphere (one geometry shared by all nodes), hover scale
    ParticleField.ts       Background and foreground drifting particle layers
    InteractionManager.ts  Pointer input: picking, drag-to-spin with coupled rings, clicks
    physics.ts             damp() and lerpToward(): constants tuned per 60 Hz frame, applied per second
    CloudLayer.ts          Wireframe clouds from a cloud-designer GLB file (not wired in yet)
    config.ts              ORBITALS (content joined with layout), NODE_RADIUS, PARTICLE_CONFIG
  ui/
    InfoPanel.ts           Section panel: buttons, hover zones, keyboard, clicks outside
    header.ts              Top bar with name and nav links
    breakpoints.ts         MOBILE_MAX_WIDTH (767 px), the value style.css uses
style.css                  Header, panel, mobile layout, reduced motion
docs/
  CONTENT.md               Content guide: sections, nodes, links, actions, layout, tests, cloud GLB
tests/
  unit/                    Vitest (Node and happy-dom)
  e2e/                     Playwright: desktop, mobile, keyboard, resilience; darwin screenshot baselines
```

## Interaction model

- Moving the pointer near the panel, or keyboard focus, expands a section. A click, Enter or Space selects it and lays its ring flat; Escape or a click outside the panel and the scene clears the selection.
- Hovering a ring or a node in the scene expands its section in the panel and highlights the node's entry. Clicking a ring or node selects its section; a click on empty canvas clears the selection.
- Dragging a ring spins it at the pointer's speed and tilts it; the other rings follow, scaled by their `couplingFactor`. Spin and tilt decay under friction. A selected (flat) ring spins only when dragged directly and coasts to rest.
- Each ring cruises at its layout `speed`, in rad/s. Motion is frame-rate independent.
- With `prefers-reduced-motion`, rings and particles move only when dragged and transitions are short.
- Without WebGL, the header and the panel still work and a short notice replaces the scene.

## Content

Sections, nodes, actions and links are in `src/content/site.ts`; orbit placement is in `src/content/layout.ts`. Every node's action is `{ kind: 'none' }` today; `external`, `route` and `suborbital` are reserved for the targets Phase 2 adds. `tests/unit/content.test.ts` runs `validateContent()` on the content.

[docs/CONTENT.md](docs/CONTENT.md) is the guide for changing content: how to add a section, a node, a link or a node action, what the layout values mean, what the checks catch, how to run the tests and update screenshot baselines on purpose, and how to load a cloud-designer GLB.

## Visual design

- White background, thin black lines for rings and wireframe nodes, no fills
- Depth from foreground and background particle layers
- Accent colour rgb(162, 127, 184) for hover and selection

## Project documentation

Project notes, plans and task tracking live in the owner's Obsidian vault; `CLAUDE.md` points agents at it.
