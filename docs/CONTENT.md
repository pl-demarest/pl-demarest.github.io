# Content guide

For Phase 2 contributors: how the landing page's sections, nodes, links and node actions are defined, what the orbit layout numbers mean, what the content checks catch, how to run the tests and update screenshot baselines on purpose, and how the cloud layer loads a cloud-designer export.

## Where content lives

| File | Holds |
|---|---|
| `src/content/types.ts` | The types: `Section`, `SiteNode`, `NodeAction`, `Link`, `OrbitLayout`, `CloudContent` |
| `src/content/site.ts` | `SECTIONS` (sections and their nodes, in display order) and `CLOUDS` |
| `src/content/layout.ts` | `LAYOUT`: where each section's orbit sits, keyed by section id |
| `src/content/validate.ts` | `validateContent()`, run by `tests/unit/content.test.ts` |
| `src/scene/config.ts` | `ORBITALS = buildOrbitals(SECTIONS, LAYOUT)`: each section joined with its layout, which the scene draws |

Each section is one ring in the scene and one category in the panel. Each node is a wireframe sphere on its ring and a button under its category.

## Add a section

1. Add a `Section` to `SECTIONS` in `site.ts`: `{ id, label, nodes }`. Order matters: the first section is the innermost ring, the top category on desktop and the leftmost on mobile.
2. Add an `OrbitLayout` under the same id to `LAYOUT` in `layout.ts`, with an angle in `nodeAngles` for every node (see [Layout values](#layout-values)). Keep the rings ordered inside out: each `radiusX` larger than the one before (`tests/unit/config.test.ts` checks this).
3. Run the tests and update the ones that pin today's three sections (see [Tests that pin today's content](#tests-that-pin-todays-content)).

Ids must be unique across sections and nodes together: a section id becomes the panel's `data-ring-id` and the node list's DOM id `ip-nodes-<id>`, a node id becomes `data-node-id`, and both key the scene's lookups.

`buildOrbitals` runs when the page loads. A section without a layout, or a node without an angle, throws there, and the page then shows nothing, not even the panel. `validateContent` reports these and more, but it runs in the unit tests, not in the page, so run them.

## Add a node

Add a `SiteNode` to its section's `nodes` and its angle to that section's `nodeAngles`:

```ts
{
  id: 'talks',                        // unique across all sections and nodes
  label: 'Talks',                     // the panel button's text
  description: 'Invited talks',       // stored, not shown anywhere yet
  action: { kind: 'none' },           // see "Node actions"
  links: [{ label: 'Slides', href: 'https://example.org/slides' }], // optional
}
```

## Add a link

`links` is an optional list of `{ label, href }` on a node. `href` is an absolute `http(s)` URL or a path on this site that starts with `/` (not `//`). Links are data only so far: nothing renders them, and Phase 2 decides where they appear. Keep URLs out of `description`; `content.test.ts` checks that descriptions hold no `http:`, `https:` or `/public/` text.

## Node actions

`action` says what activating a node does. A node is activated by its panel button (click, Enter or Space) or by a click on its sphere in the scene (press and release in place); a click on the sphere also toggles its section's selection, as a click on its ring does.

| `kind` | Fields | Meaning |
|---|---|---|
| `none` | | Nothing happens. Every node uses this today. |
| `external` | `href`: absolute `http(s)` URL | Open an external page |
| `route` | `path`: starts with `/` | Go to a page of this site |
| `suborbital` | `sectionId`: another section's id | Open a sub-orbit built from that section |

Only `none` is implemented. The other kinds are typed and validated; `App.activateNode` (`src/app/App.ts`) logs a console warning that they are not implemented, and Phase 2 implements them there.

## The panel and the keyboard

Each section is a category in the panel: a button with the section's label, then one button per node. With the keyboard:

- Tab walks the header, then each category's name followed by its nodes; Shift+Tab walks the same stops backward.
- Focus on a name or a node expands its category, as the pointer does. Enter or Space on a name selects its section and lays its ring flat, or deselects it; on a node it activates the node (see [Node actions](#node-actions)). Escape clears the selection; with focus in a category, focus moves to its name and the category stays open.
- A category's node buttons are in the tab order while the category holds keyboard focus or is selected. A pointer over the panel or over a ring expands a category without adding its nodes to the tab order, so where the mouse rests never changes the tab order. Shift+Tab from a category's name first adds the category before it, so focus lands on that category's last node, as Tab left it.
- A collapsed category's node list is hidden from assistive technology. A name reports `aria-expanded` (its list is open) and `aria-pressed` (its section is selected).

Every node is a stop on a full walk, so long node lists make the walk long.

## Layout values

All lengths are three.js world units. The desktop camera sits at (0, 5.5, 8) with a 45 degree field of view, the mobile camera at (0, 7, 14) with 65 degrees, both looking at the origin. Today's rings measure 2.2 x 1.6, 3.2 x 2.3 and 4.2 x 3.0.

| Field | Unit | Meaning |
|---|---|---|
| `radiusX`, `radiusY` | world units | The ellipse's half-axes in the ring's own plane (its local x and z). |
| `tilt.x`, `tilt.z` | radians | The ring's rotation about x and z. The ring returns to this tilt after a drag; a selected ring turns face-on instead (x = pi/2, z = 0). |
| `speed` | radians per second | The cruise: how fast the ring turns once it settles, at any frame rate. A negative value turns it the other way; `config.test.ts` rejects zero, which would leave the ring still. A ring starts faster (at `speed / CRUISE_RATIO`, about 3.97 times `speed`; `CRUISE_RATIO` is in `OrbitalRing.ts`) and settles to `speed`; after a drag, friction brings it back to `speed`. |
| `couplingFactor` | a share, today 0.3 to 0.4 | How much of a drag on another ring this ring takes: 0.125 rad/s of spin per pixel of horizontal drag and 0.005 rad/s of tilt per pixel, times this factor. A selected ring takes no coupled motion. |
| `nodeAngles` | radians, by node id | Where each node sits: at (cos(t + a) x `radiusX`, 0, sin(t + a) x `radiusY`) in the ring's frame, where `a` is the node's angle and `t` the ring's orbit angle, 0 when the page loads and growing as the ring turns. Spread n nodes evenly with steps of 2 pi / n. |

A drag spins the dragged ring at 0.008 rad per pixel of horizontal pointer movement, at the pointer's speed, and adds 0.005 rad/s of tilt per pixel, which eases back. After the release the ring coasts on: friction takes 3 % of its spin per 60 Hz frame, and the coast adds about half a second's worth of its spin at the release (a release at 600 px/s, a spin of 4.8 rad/s, turns it about 2.5 rad further) before it settles back to `speed`. A selected (flat) ring keeps its pose and coasts the same way to rest.

With `prefers-reduced-motion`, rings do not turn on their own and the flat view snaps instead of easing; a drag still turns them, and they coast to rest.

## What `validateContent` checks

`validateContent(SECTIONS, LAYOUT)` returns one message per problem; `content.test.ts` expects none.

- Every section and node id is non-empty and unique across sections and nodes together.
- Every section and node label is non-empty.
- Every section has a layout, and every layout belongs to a section.
- `radiusX`, `radiusY`, `tilt.x`, `tilt.z`, `speed` and `couplingFactor` are finite numbers.
- Every node has a finite angle in its section's `nodeAngles`, and `nodeAngles` names no other node.
- Actions: `external` needs an absolute `http(s)` URL; `route` a path that starts with `/` and not `//`; `suborbital` an existing section other than its own; any other kind is reported.
- Links: a non-empty label, and an `href` that is an absolute `http(s)` URL or a path that starts with `/`.

It does not check signs or sizes. `config.test.ts` checks that radii and coupling factors are positive, that no speed is zero (a negative speed is allowed), and that the rings are ordered inside out, and it pins today's section and node labels.

## Run the tests

```bash
npm run check      # type-check, lint, unit tests (Vitest) and production build
npm run test:e2e   # browser suite (Playwright with the installed Google Chrome)
```

The full gate, as the refactor runs it:

```bash
npm run typecheck && npx eslint . && CI=1 npx vitest run && npm run build && npx playwright test
```

The browser suite starts its own Vite server on port 5173, so that port must be free. It uses the installed Google Chrome (`channel: 'chrome'`) with software WebGL; no browser download is needed. Continuous integration runs type-check, lint, unit tests and build on branches other than `main`; the browser suite runs locally only.

The browser suite holds every page still (`tests/e2e/support/fixtures.ts`): the clock is frozen and steps the scene in exact 1/60 s frames only when a test advances it, `Math.random` and the particle layout are seeded, and a test can read ring angles and node positions directly with `readScene()` (`tests/e2e/support/sceneProbe.ts`).

### Tests that pin today's content

Adding, removing or reordering sections or nodes can need these updates:

- `tests/unit/config.test.ts`: 'pins the current section order and labels'.
- `tests/e2e/keyboard.spec.ts`: the accessibility snapshots list the three section buttons, with `/children: equal`.
- `tests/unit/content.test.ts`: every node's action is `none`, `CLOUDS` has no asset, and the Code node's link.
- Unit and browser tests that use today's sections and nodes as fixtures (`InfoPanel.test.ts`, `net-gaps/info-panel-zone-gaps.test.ts`, `App.test.ts`, `desktop.spec.ts`, `keyboard.spec.ts`): they keep working while those sections and nodes exist with their ids and order; expected values change if the count or order changes.
- `tests/e2e/desktop.spec.ts` checks that its empty point (60, 740) has no ring or node under it; a larger ring can cover it.
- The screenshot baselines, below.

### Update screenshot baselines on purpose

Six screenshots in `tests/e2e/__screenshots__/` are compared with `maxDiffPixels: 0`: desktop idle, desktop with each section selected, mobile idle and mobile with Projects selected. They are recorded on macOS (`-darwin` in the file name); on another platform these tests find no baseline and fail.

A change that alters what the page draws (a section or node, a layout value, a style) changes them, and a test that fails then is reporting the change. To update them:

1. Run the browser suite and look at each failing screenshot's diff: `npx playwright show-report`, or the `*-diff.png` files under `test-results/`. Confirm that only the intended change differs.
2. Re-record only the affected tests, for example `npx playwright test -g "selects it and flattens" --update-snapshots`.
3. Run the suite twice more; both runs must pass with the new images.
4. Commit the images in the commit that makes the visible change, and say in its message why they changed and how many pixels differed in each image.

Delete `test-results/` and `playwright-report/` afterwards; both are ignored by git.

## Clouds from cloud-designer

`src/scene/CloudLayer.ts` draws wireframe clouds drifting across the bottom of the scene from a binary glTF (GLB) file exported by cloud-designer (decision D3 of the 2026-11 refactor plan). It is not wired into the app yet: `CLOUDS.asset` is `null` until a cloud asset exists.

Export a cloud from cloud-designer's Export panel (button names as of November 2026): run Cut & Glue, then **Export Cloud GLB**. The file, `<preset-name>-cloud.glb`, holds the unified wireframe as one `THREE.LineSegments` (glTF mode LINES). **Export Wireframe GLB** and **Export Both (Full)** load as well: their flow lines are `THREE.Line` (LINE_STRIP), which `loadCloudLayer` converts to segment pairs. Every line in the file is drawn, transforms applied; meshes, such as editor handles, are ignored. A file without lines is rejected. For tests, `buildGlb()` in `tests/unit/helpers/glb.ts` writes small GLB files with LINES, LINE_STRIP or other primitives, and `tests/fixtures/cloud-designer/` holds a Cloud GLB and a Wireframe GLB exported from cloud-designer's default preset, which `tests/unit/cloudDesignerExport.test.ts` loads with `loadCloudLayer` (their provenance, and how to export them again, are in the README.md there).

Use it:

1. Put the file under `public/`, for example `public/clouds/default.glb`; Vite serves it at `/clouds/default.glb`.
2. Set `CLOUDS.asset` in `site.ts` to `'clouds/default.glb'`, and update the 'has no cloud asset yet' test.
3. Load it in `App.createScene`, where the other scene objects are made. A sketch; App imports neither `CLOUDS` nor `loadCloudLayer` yet (`import.meta.env` has its types from `src/vite-env.d.ts`):

   ```ts
   if (CLOUDS.asset) {
     loadCloudLayer(sm.scene, `${import.meta.env.BASE_URL}${CLOUDS.asset}`, { scale: 1 })
       .then(clouds => {
         sm.onTick(dt => clouds.update(dt));
         this.disposers.push(() => clouds.dispose());
       })
       .catch(error => console.warn('The clouds could not load.', error));
   }
   ```

`loadCloudLayer` imports three.js's `GLTFLoader` on first use, so pages without clouds do not download it. Its options (`CloudLayerOptions`) and their defaults: `count` 3 clouds, `baselineY` -3, `depth` -2 (z), `spread` 14 (the clouds cross from x = 14 to x = -14 and wrap), `speed` 0.4 world units per second, `bobAmplitude` 0.15, `bobPeriod` 6 s, `scale` 1, `opacity` 0.6. cloud-designer's units are not the landing page's, so set `scale` by eye.
