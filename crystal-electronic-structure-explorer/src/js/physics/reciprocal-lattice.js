// src/js/physics/reciprocal-lattice.js
import { cross, dot, scale } from './vector.js';

/**
 * Calculates reciprocal primitive vectors from real primitive vectors.
 * Returns array of 3 vectors, each in 1/Angstrom.
 */
export function calculateReciprocalVectors(primitiveVectors) {
  const [a1, a2, a3] = primitiveVectors;
  
  // Volume V_p = a1 . (a2 x a3)
  const a2_cross_a3 = cross(a2, a3);
  const vp = dot(a1, a2_cross_a3);
  
  if (Math.abs(vp) < 1e-6) {
    throw new Error('Real space primitive vectors must span a non-zero volume.');
  }

  const b1 = scale(cross(a2, a3), (2 * Math.PI) / vp);
  const b2 = scale(cross(a3, a1), (2 * Math.PI) / vp);
  const b3 = scale(cross(a1, a2), (2 * Math.PI) / vp);

  return [b1, b2, b3];
}

/**
 * Checks if the orthogonality condition holds: a_i . b_j = 2pi * delta_ij
 */
export function verifyOrthogonality(primitiveVectors, reciprocalVectors, tolerance = 1e-5) {
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const dotProd = dot(primitiveVectors[i], reciprocalVectors[j]);
      const expected = (i === j) ? 2 * Math.PI : 0;
      if (Math.abs(dotProd - expected) > tolerance) {
        return {
          pass: false,
          error: `Orthogonality failed: a[${i+1}] . b[${j+1}] = ${dotProd.toFixed(6)} (expected ${expected.toFixed(6)})`
        };
      }
    }
  }
  return { pass: true };
}
