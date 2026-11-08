// @vitest-environment happy-dom
// (three's FileLoader, used by loadCloudLayer, needs fetch and ProgressEvent.)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { loadCloudLayer } from '../../src/scene/CloudLayer';
import { glbDataUrl, readGlbJson, type GltfJson } from './helpers/glb';

// The contract with cloud-designer: files cloud-designer exported on its
// default preset, kept with their provenance in
// tests/fixtures/cloud-designer/ (README.md there; export-glb.ts writes
// them again), load through loadCloudLayer as the page would load them.

const LINES = 1;
const LINE_LOOP = 2;
const LINE_STRIP = 3;

function fixture(name: string): ArrayBuffer {
  // A path, not a URL: happy-dom's URL class resolves file URLs differently from Node's.
  const bytes = readFileSync(join(import.meta.dirname, '../fixtures/cloud-designer', name));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

/** Every primitive drawn in the file's scene, with its mode and vertex count, in scene order. */
function primitives(gltf: GltfJson): Array<{ mode: number; count: number; accessor: number }> {
  const out: Array<{ mode: number; count: number; accessor: number }> = [];
  const visit = (index: number): void => {
    const node = gltf.nodes[index]!;
    for (const p of node.mesh === undefined ? [] : gltf.meshes[node.mesh]!.primitives) {
      const count = gltf.accessors[p.indices ?? p.attributes.POSITION]!.count;
      out.push({ mode: p.mode ?? 4, count, accessor: p.attributes.POSITION });
    }
    for (const child of node.children ?? []) visit(child);
  };
  for (const root of gltf.scenes[gltf.scene ?? 0]!.nodes ?? []) visit(root);
  return out;
}

/** The segment-pair vertices the file's line primitives draw: LINES as they are, strips and loops as pairs. */
function segmentVertexCount(gltf: GltfJson): number {
  let total = 0;
  for (const { mode, count } of primitives(gltf)) {
    if (mode === LINES) total += count;
    else if (mode === LINE_STRIP) total += 2 * Math.max(0, count - 1);
    else if (mode === LINE_LOOP && count > 1) total += 2 * count;
  }
  return total;
}

/** The box around the file's line vertices, from its accessors' min and max. */
function accessorBox(gltf: GltfJson): THREE.Box3 {
  const box = new THREE.Box3();
  for (const { accessor } of primitives(gltf)) {
    const { min, max } = gltf.accessors[accessor]!;
    box.expandByPoint(new THREE.Vector3(...(min as [number, number, number])));
    box.expandByPoint(new THREE.Vector3(...(max as [number, number, number])));
  }
  return box;
}

/** The drawn objects GLTFLoader makes from the file, by three.js type. */
async function drawnTypes(glb: ArrayBuffer): Promise<string[]> {
  const gltf = await new GLTFLoader().parseAsync(glb, '');
  const types: string[] = [];
  gltf.scene.traverse(o => {
    if ((o as THREE.Mesh).geometry) types.push(o.type);
  });
  return types;
}

async function load(glb: ArrayBuffer) {
  const scene = new THREE.Scene();
  const layer = await loadCloudLayer(scene, glbDataUrl(glb));
  const geometry = layer.instances[0]!.geometry;
  return { scene, layer, geometry, positions: geometry.getAttribute('position').array as Float32Array };
}

function expectBox(box: THREE.Box3, min: [number, number, number], max: [number, number, number]): void {
  box.min.toArray().forEach((v, i) => expect(v, `min ${'xyz'[i]}`).toBeCloseTo(min[i]!, 4));
  box.max.toArray().forEach((v, i) => expect(v, `max ${'xyz'[i]}`).toBeCloseTo(max[i]!, 4));
}

describe("cloud-designer's Cloud GLB (Export Cloud GLB)", () => {
  const glb = fixture('default-cloud-cloud.glb');
  const gltf = readGlbJson(glb);

  it('holds one LineSegments under a root named cloud, which loadCloudLayer draws as one merged buffer', async () => {
    expect(glb.byteLength).toBeLessThan(200_000);
    expect(gltf.nodes[gltf.scenes[0]!.nodes![0]!]!.name).toBe('cloud');
    expect(primitives(gltf).map(p => p.mode)).toEqual([LINES]);
    expect(await drawnTypes(glb)).toEqual(['LineSegments']);

    const { scene, layer, geometry } = await load(glb);
    expect(scene.children).toEqual([layer.group]);
    for (const instance of layer.instances) {
      expect(instance).toBeInstanceOf(THREE.LineSegments);
      expect(instance.geometry).toBe(geometry);
    }
    layer.dispose();
  });

  it('keeps every vertex of the file: as many as its accessor counts, all finite', async () => {
    const { layer, geometry, positions } = await load(glb);
    expect(segmentVertexCount(gltf)).toBe(4498);
    expect(geometry.getAttribute('position').count).toBe(segmentVertexCount(gltf));
    expect(positions.every(Number.isFinite)).toBe(true);
    layer.dispose();
  });

  it("spans the designer's default cloud", async () => {
    const { layer, geometry } = await load(glb);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.equals(accessorBox(gltf))).toBe(true);
    // x: the base, whose curve starts at -2.5 (its first ring, tilted with
    // the curve, reaches 0.12 further), to the tail's tip near 4.2; y: the
    // tail's wide end below the base's end (-0.8), to the top of sphere 1
    // (0.3 + radius 1.0); z: sphere 0's radius, 1.2.
    expectBox(box, [-2.6185, -1.5533, -1.2], [4.2688, 1.3, 1.2]);
    expect(box.max.y).toBeCloseTo(0.3 + 1.0, 6);
    expect(box.max.z).toBeCloseTo(1.2, 6);
    expect(box.min.z).toBeCloseTo(-1.2, 6);
    layer.dispose();
  });
});

describe("cloud-designer's Wireframe GLB (Export Wireframe GLB)", () => {
  const glb = fixture('default-cloud-wireframe.glb');
  const gltf = readGlbJson(glb);

  it('holds the flow lines as line strips and the tail as line segments, which loadCloudLayer merges', async () => {
    expect(glb.byteLength).toBeLessThan(200_000);
    const modes = primitives(gltf).map(p => p.mode);
    expect(modes).toEqual([...Array<number>(16).fill(LINE_STRIP), LINES]);
    expect(await drawnTypes(glb)).toEqual([...Array<string>(16).fill('Line'), 'LineSegments']);

    const { layer, geometry } = await load(glb);
    for (const instance of layer.instances) {
      expect(instance).toBeInstanceOf(THREE.LineSegments);
      expect(instance.geometry).toBe(geometry);
    }
    layer.dispose();
  });

  it('keeps every vertex of the file: as many as its accessor counts give as segment pairs, all finite', async () => {
    const { layer, geometry, positions } = await load(glb);
    // 16 strips, 2217 vertices in all, give 2(n - 1) each; the tail's LINES give their own 1560.
    expect(segmentVertexCount(gltf)).toBe(2 * (2217 - 16) + 1560);
    expect(geometry.getAttribute('position').count).toBe(segmentVertexCount(gltf));
    expect(positions.every(Number.isFinite)).toBe(true);
    layer.dispose();
  });

  it("spans the default cloud's flow lines and tail", async () => {
    const { layer, geometry } = await load(glb);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.equals(accessorBox(gltf))).toBe(true);
    // The flow lines run inside the spheres' surface between the front and
    // back anchors (x -2 and 2.5); the tail reaches x 4.27 and y -1.55, as
    // in the Cloud GLB.
    expectBox(box, [-2.3052, -1.5533, -0.9811], [4.2688, 1.0961, 0.9824]);
    layer.dispose();
  });
});
