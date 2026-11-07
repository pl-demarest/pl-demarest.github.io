/**
 * Build a minimal binary glTF (GLB): one node holding one mesh with one
 * primitive. The default mode 1 (LINES) is how cloud-designer exports
 * wireframes: `positions` holds x, y, z per vertex, and consecutive vertex
 * pairs are edges.
 */
export function buildLinesGlb(
  positions: number[],
  { translation = [0, 0, 0], mode = 1 }: { translation?: [number, number, number]; mode?: number } = {},
): ArrayBuffer {
  const bin = new Float32Array(positions);
  const count = positions.length / 3;
  const min = [0, 1, 2].map(axis => Math.min(...positions.filter((_, i) => i % 3 === axis)));
  const max = [0, 1, 2].map(axis => Math.max(...positions.filter((_, i) => i % 3 === axis)));
  const json = {
    asset: { version: '2.0', generator: 'githubLanding test fixture' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode }] }],
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.byteLength, target: 34962 }],
    accessors: [{ bufferView: 0, componentType: 5126, count, type: 'VEC3', min, max }],
  };

  const pad = (n: number) => (4 - (n % 4)) % 4;
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = jsonBytes.length + pad(jsonBytes.length);
  const binLength = bin.byteLength + pad(bin.byteLength);
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
  bytes.set(new Uint8Array(bin.buffer), binStart + 8);
  return out;
}

/** A data: URL for a GLB, so tests can load it through the real loader without a server. */
export function glbDataUrl(glb: ArrayBuffer): string {
  return `data:model/gltf-binary;base64,${Buffer.from(glb).toString('base64')}`;
}
