// src/js/physics/brillouin-zone.js
import { dot, cross, add, scale, sub, norm, normalize, invert3x3, matrixVectorMultiply } from './vector.js';

/**
 * Generates the first Brillouin zone (Wigner-Seitz cell of the reciprocal lattice)
 * for arbitrary reciprocal lattice primitive vectors [b1, b2, b3].
 * 
 * Returns: {
 *   vertices: Array of [x, y, z] coordinates,
 *   faces: Array of arrays of vertex indices (sorted counter-clockwise around the face normal)
 * }
 */
export function generateBrillouinZone(reciprocalVectors) {
  const [b1, b2, b3] = reciprocalVectors;
  
  // 1. Generate reciprocal lattice points G_hkl around the origin
  const gPoints = [];
  const maxRange = 2; // -2 to +2 covers the first Wigner-Seitz shell for SC, FCC, BCC
  
  for (let h = -maxRange; h <= maxRange; h++) {
    for (let k = -maxRange; k <= maxRange; k++) {
      for (let l = -maxRange; l <= maxRange; l++) {
        if (h === 0 && k === 0 && l === 0) continue;
        
        // G = h*b1 + k*b2 + l*b3
        const g = [
          h * b1[0] + k * b2[0] + l * b3[0],
          h * b1[1] + k * b2[1] + l * b3[1],
          h * b1[2] + k * b2[2] + l * b3[2]
        ];
        
        gPoints.push(g);
      }
    }
  }
  
  // 2. Sort G points by distance from origin to process nearest shells first
  gPoints.sort((gA, gB) => norm(gA) - norm(gB));
  
  // 3. Filter planes to keep only those relevant to the first Wigner-Seitz cell (nearest shells)
  // For standard lattices, the nearest 14 to 30 planes define the boundary.
  const numPlanesToKeep = Math.min(30, gPoints.length);
  const planes = []; // each plane: { normal, distance, g }
  
  for (let i = 0; i < numPlanesToKeep; i++) {
    const g = gPoints[i];
    const len = norm(g);
    // plane equation: k . g = 0.5 * |g|^2
    planes.push({
      normal: normalize(g),
      distance: 0.5 * len,
      g: g
    });
  }
  
  // 4. Intersect all triplets of planes to find candidate vertices
  const candidates = [];
  const tol = 1e-4;
  
  for (let i = 0; i < planes.length; i++) {
    for (let j = i + 1; j < planes.length; j++) {
      for (let k = j + 1; k < planes.length; k++) {
        const p1 = planes[i];
        const p2 = planes[j];
        const p3 = planes[k];
        
        // Assemble 3x3 matrix where rows are the normals
        const m = [p1.normal, p2.normal, p3.normal];
        
        // Check determinant to ensure they intersect at a single point
        const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
                    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
                    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
                    
        if (Math.abs(det) < 1e-6) continue; // parallel or coplanar
        
        try {
          const mInv = invert3x3(m);
          const x = matrixVectorMultiply(mInv, [p1.distance, p2.distance, p3.distance]);
          
          // Verify if the candidate satisfies all half-space constraints: k . g <= 0.5 * |g|^2 + tol
          let isValid = true;
          for (let pIdx = 0; pIdx < planes.length; pIdx++) {
            if (pIdx === i || pIdx === j || pIdx === k) continue;
            const plane = planes[pIdx];
            const proj = dot(x, plane.normal);
            if (proj > plane.distance + tol) {
              isValid = false;
              break;
            }
          }
          
          if (isValid) {
            candidates.push(x);
          }
        } catch (e) {
          // singular matrix, ignore
        }
      }
    }
  }
  
  // 5. Filter duplicate vertices
  const vertices = [];
  for (const c of candidates) {
    let isDup = false;
    for (const v of vertices) {
      if (norm(sub(c, v)) < tol) {
        isDup = true;
        break;
      }
    }
    if (!isDup) {
      vertices.push(c);
    }
  }
  
  // 6. Construct faces by grouping vertices that lie on each plane
  const faces = [];
  for (const p of planes) {
    const faceVertexIndices = [];
    for (let vIdx = 0; vIdx < vertices.length; vIdx++) {
      const v = vertices[vIdx];
      const proj = dot(v, p.normal);
      if (Math.abs(proj - p.distance) < tol) {
        faceVertexIndices.push(vIdx);
      }
    }
    
    // Valid faces must have at least 3 vertices
    if (faceVertexIndices.length >= 3) {
      // Sort face vertices angularly around the face center and plane normal
      // This orders them counter-clockwise for proper polygon triangulation
      const faceCenter = faceVertexIndices.reduce(
        (sum, idx) => add(sum, vertices[idx]),
        [0, 0, 0]
      ).map(val => val / faceVertexIndices.length);
      
      const v0 = vertices[faceVertexIndices[0]];
      const u1 = normalize(sub(v0, faceCenter));
      const u2 = normalize(cross(p.normal, u1));
      
      faceVertexIndices.sort((idxA, idxB) => {
        const dA = sub(vertices[idxA], faceCenter);
        const dB = sub(vertices[idxB], faceCenter);
        const angleA = Math.atan2(dot(dA, u2), dot(dA, u1));
        const angleB = Math.atan2(dot(dB, u2), dot(dB, u1));
        return angleA - angleB;
      });
      
      faces.push(faceVertexIndices);
    }
  }
  
  return { vertices, faces };
}

/**
 * Verification utility for testing FCC Reciprocal Brillouin zone geometry.
 */
export function verifyFCCBrillouinZoneTopology(bzResult) {
  const { vertices, faces } = bzResult;
  const numVertices = vertices.length;
  const numFaces = faces.length;
  
  // Truncated octahedron has 24 vertices and 14 faces
  if (numVertices !== 24 || numFaces !== 14) {
    return {
      pass: false,
      error: `Expected 24 vertices and 14 faces for FCC BZ, got ${numVertices} vertices and ${numFaces} faces.`
    };
  }
  
  let squares = 0;
  let hexagons = 0;
  let edgesCount = 0;
  
  // Check that all faces are squares (4 edges) or hexagons (6 edges)
  const edgeSet = new Set();
  for (const f of faces) {
    const len = f.length;
    if (len === 4) squares++;
    else if (len === 6) hexagons++;
    else {
      return {
        pass: false,
        error: `Unexpected face with ${len} edges in FCC BZ.`
      };
    }
    
    // Accumulate edges (avoiding double counting)
    for (let i = 0; i < len; i++) {
      const idx1 = Math.min(f[i], f[(i + 1) % len]);
      const idx2 = Math.max(f[i], f[(i + 1) % len]);
      edgeSet.add(`${idx1}-${idx2}`);
    }
  }
  
  edgesCount = edgeSet.size;
  
  if (squares !== 6 || hexagons !== 8 || edgesCount !== 36) {
    return {
      pass: false,
      error: `Expected 6 square faces, 8 hexagonal faces, and 36 edges. Got ${squares} squares, ${hexagons} hexagons, and ${edgesCount} edges.`
    };
  }
  
  // Euler characteristic check: V - E + F = 2
  // 24 - 36 + 14 = 2
  const euler = numVertices - edgesCount + numFaces;
  if (euler !== 2) {
    return {
      pass: false,
      error: `Euler characteristic failed: V - E + F = ${euler} (expected 2)`
    };
  }
  
  return { pass: true };
}
