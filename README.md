# pl-demarest.github.io

Interactive portfolio and CV built with **Vite + TypeScript + Three.js**. The landing page features a 3D orbital navigation system where elliptical rings represent experience categories and wireframe sphere nodes represent individual projects.

## Running locally

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build to dist/
```

## Architecture

```
src/
  main.ts                     Entry point, wires scene + UI
  scene/
    SceneManager.ts           WebGL renderer, perspective camera, animation loop
    OrbitalRing.ts            Ellipse line geometry, angular velocity, tilt, child nodes
    OrbitalNode.ts            Wireframe sphere mesh, hover scaling
    RingLabel.ts              Per-character 3D text wrapping along ring curves
    ParticleField.ts          Background + foreground drifting particle layers
    InteractionManager.ts     Raycaster, drag-to-spin, coupled rotation, hover detection
    config.ts                 Data-driven orbital/node/particle definitions
  ui/
    header.ts                 Top bar with name and nav links
    legend.ts                 Hover panel showing node label and description
```

## Visual design

- White background, black thin lines for rings and wireframe nodes
- Minimalist wireframe aesthetic — no fills
- Depth via foreground/background particle layers
- Category labels curve-wrapped along each ring, mirrored on both sides so one is always legible
- Labels fade to high opacity on hover/interaction

## Interaction model

- Each ring has an invisible tube hit mesh along its path for independent grab zones
- Horizontal drag spins nodes along the orbit and tilts the ring's Z-axis
- Vertical drag tilts the ring's X-axis
- Non-active rings follow with damped coupling (configurable `couplingFactor`)
- All velocities decay with exponential friction on release
- Hovering a node scales it up and populates the legend panel

## Configuration

All orbital geometry, node metadata, and particle settings are defined in `src/scene/config.ts`. Adding a new ring or node is a config change — no structural modifications needed.

## Project documentation

Vault-side project docs, kanban, and task tracking live in the Obsidian vault at:
`/Users/Phil/Library/CloudStorage/Box-Box/obsidian/projects/githubLanding/`
