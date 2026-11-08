/** One mesh primitive for buildGlb. */
export interface GlbPrimitive {
  /** x, y, z per vertex. */
  positions: number[];
  /**
   * glTF primitive mode: 1 LINES (the default; consecutive vertex pairs are
   * edges), 2 LINE_LOOP, 3 LINE_STRIP, 4 TRIANGLES.
   */
  mode?: number;
  /** Translation of the node that holds the primitive's mesh. */
  translation?: [number, number, number];
}

/**
 * Build a minimal binary glTF (GLB): one scene with one node and one mesh
 * per primitive, in order. cloud-designer exports wireframes as mode 1
 * (LINES) and its flow lines as mode 3 (LINE_STRIP).
 */
export function buildGlb(primitives: GlbPrimitive[]): ArrayBuffer {
  const arrays = primitives.map(p => new Float32Array(p.positions));
  const offsets = arrays.map((_, i) => arrays.slice(0, i).reduce((n, a) => n + a.byteLength, 0));
  const binByteLength = arrays.reduce((n, a) => n + a.byteLength, 0);
  const json = {
    asset: { version: '2.0', generator: 'githubLanding test fixture' },
    scene: 0,
    scenes: [{ nodes: primitives.map((_, i) => i) }],
    nodes: primitives.map((p, i) => ({ mesh: i, translation: p.translation ?? [0, 0, 0] })),
    meshes: primitives.map((p, i) => ({ primitives: [{ attributes: { POSITION: i }, mode: p.mode ?? 1 }] })),
    buffers: [{ byteLength: binByteLength }],
    bufferViews: arrays.map((a, i) => ({ buffer: 0, byteOffset: offsets[i], byteLength: a.byteLength, target: 34962 })),
    accessors: primitives.map((p, i) => {
      const axis = (k: number) => p.positions.filter((_, j) => j % 3 === k);
      return {
        bufferView: i,
        componentType: 5126,
        count: p.positions.length / 3,
        type: 'VEC3',
        min: [0, 1, 2].map(k => Math.min(...axis(k))),
        max: [0, 1, 2].map(k => Math.max(...axis(k))),
      };
    }),
  };

  const pad = (n: number) => (4 - (n % 4)) % 4;
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = jsonBytes.length + pad(jsonBytes.length);
  const binLength = binByteLength + pad(binByteLength);
  const total = 12 + 8 + jsonLength + 8 + binLength;

  const out = new ArrayBuffer(total);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);
  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  bytes.set(jsonBytes, 20);
  bytes.fill(0x20, 20 + jsonBytes.length, 20 + jsonLength); // pad JSON with spaces
  const binStart = 20 + jsonLength;
  view.setUint32(binStart, binLength, true);
  view.setUint32(binStart + 4, 0x004e4942, true); // 'BIN\0'
  arrays.forEach((a, i) => bytes.set(new Uint8Array(a.buffer), binStart + 8 + offsets[i]!));
  return out;
}

/** A GLB holding one primitive (LINES unless `mode` says otherwise). */
export function buildLinesGlb(
  positions: number[],
  { translation = [0, 0, 0], mode = 1 }: { translation?: [number, number, number]; mode?: number } = {},
): ArrayBuffer {
  return buildGlb([{ positions, translation, mode }]);
}

/** A data: URL for a GLB, so tests can load it through the real loader without a server. */
export function glbDataUrl(glb: ArrayBuffer): string {
  return `data:model/gltf-binary;base64,${Buffer.from(glb).toString('base64')}`;
}
