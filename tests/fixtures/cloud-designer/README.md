# cloud-designer GLB fixtures

Two files exported by cloud-designer, the editor whose Cloud GLB the landing page's `loadCloudLayer` (`src/scene/CloudLayer.ts`) loads. `tests/unit/cloudDesignerExport.test.ts` loads both with `loadCloudLayer` and checks what it draws against the files' own accessors, so a change on either side of the contract fails a test.

## Provenance

| | |
|---|---|
| Source | `pl-demarest/cloud-designer`, commit `5c1845f91660b00f3b37e9a3f404addda41bfff6` (branch `refactor/2026-11`, local and not pushed on 2026-11-08) |
| Preset | The default preset the editor opens with: "Default Cloud", `DEFAULT_PRESET` in `src/model/defaults.ts` (three spheres, the default base and tail, no spirals, a spiral-mode flow cloud at resolution 64 with 16 flow lines and Generate Bands off) |
| Steps | Built with `npm run build` and served with `vite preview`; in Google Chrome at 1280 x 800, in a new browser context (no autosave in localStorage): **Regenerate** and then **Cut & Glue** in the Flow Cloud panel, then **Export Cloud GLB** and **Export Wireframe GLB** in the Export panel |
| Script | `export-glb.ts` beside this file |
| Date | 2026-11-08; three runs wrote identical bytes |

| File | Button | Bytes | SHA-256 |
|---|---|---|---|
| `default-cloud-cloud.glb` | Export Cloud GLB | 54,700 | `6ce70bcb41aa445e229f1b905f1be1cbeb55dbfe820b8b95ec9a1b9e62896562` |
| `default-cloud-wireframe.glb` | Export Wireframe GLB | 51,960 | `042d8949e0b21b5a1fd3f7bdf9c2708d9d20f5d1bc4c814b03e966e3949be24e` |

## What the files hold

- `default-cloud-cloud.glb`: a root node `cloud` with one mesh of one `LINES` primitive, 4,498 vertices (2,249 segments): the Cut & Glue wireframe. Bounds x -2.6185 to 4.2688, y -1.5533 to 1.3, z -1.2 to 1.2: the base, whose curve starts at x -2.5, to the tail's tip near x 4.2; the tail's wide end below the base's end, up to the top of sphere 1 (y 0.3 plus radius 1.0); sphere 0's radius (1.2) on z.
- `default-cloud-wireframe.glb`: a root node `cloud-wireframe` with `body` (an empty `bands` group and 16 flow lines, each a `LINE_STRIP` primitive, 2,217 vertices in all) and `tail` (one `LINES` primitive, 1,560 vertices). `loadCloudLayer` turns the strips into 4,402 segment vertices, 5,962 with the tail. Bounds x -2.3052 to 4.2688, y -1.5533 to 1.0961, z -0.9811 to 0.9824.

Neither file holds a triangle mesh or an editor handle.

## Writing them again

When cloud-designer's export changes, export again and update the numbers here and in the test:

```bash
# in a copy of cloud-designer at the commit to pin
npm ci && npm run build
npx vite preview --host 127.0.0.1 --port 4184 --strictPort &

# in this repository (Node 23.6 or later runs the TypeScript file directly)
node tests/fixtures/cloud-designer/export-glb.ts http://127.0.0.1:4184/
```

The script uses the installed Google Chrome through Playwright (`channel: 'chrome'`), prints each file's size and SHA-256, and overwrites the two files here.
